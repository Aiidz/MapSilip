begin;

-- Remove mandatory invitation hash constraint from account_requests
alter table public.account_requests drop constraint if exists account_requests_check;
alter table public.account_requests add constraint account_requests_check
  check ((status = 'pending' and reviewed_at is null) or
         (status = 'rejected' and reviewed_at is not null) or
         (status in ('approved', 'activated') and reviewed_at is not null
           and (invitation_hash is not null or activated_user_id is not null)));

-- Store rejection reason directly on the account_requests record
alter table public.account_requests add column if not exists rejection_reason text;

-- Auth identity is provisioned through Supabase Auth Admin before this call.
-- Never update auth.users directly: Auth owns confirmation and password state.
create or replace function mapsilip_private.submit_account_request(
  p_email text, p_name text, p_phone text, p_user_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.account_requests%rowtype;
begin
  p_email := lower(trim(p_email)); p_name := trim(p_name); p_phone := nullif(trim(p_phone), '');
  if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email) > 320
     or length(p_name) not between 1 and 80 or (p_phone is not null and length(p_phone) not between 6 and 30) then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  if p_user_id is null or not exists (
      select 1 from auth.users u where u.id = p_user_id
        and lower(u.email) = p_email and u.email_confirmed_at is not null
        and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
    ) or exists (select 1 from mapsilip_private.accounts a where a.user_id = p_user_id)
      or exists (select 1 from public.tenant_profiles p where p.user_id = p_user_id) then
    raise exception 'request identity unavailable' using errcode = '42501';
  end if;
  insert into public.account_requests(email, display_name, phone, activated_user_id)
    values (p_email, p_name, p_phone, p_user_id)
    on conflict do nothing returning * into r;
  if r.id is null then
    select * into r from public.account_requests where email = p_email and status in ('pending','approved','activated');
  end if;
  if r.id is null or r.activated_user_id is distinct from p_user_id then
    raise exception 'request unavailable' using errcode = '23505';
  end if;
  insert into public.notifications(recipient_id, title, body, href, event_key)
    select a.user_id, 'Tenant access request', 'A new tenant access request from ' || p_name || ' is ready for review.',
      '/management/tenants', 'account-request:' || r.id::text || ':created:' || a.user_id::text
    from mapsilip_private.accounts a where a.role = 'owner' and a.status = 'active'
    on conflict (event_key) do nothing;
  return jsonb_build_object('state','received','id',r.id);
end;
$$;

-- Review account request: enforce room assignment on approval, create tenant profile & notifications
create or replace function mapsilip_private.review_account_request(
  p_id uuid,
  p_decision text,
  p_invitation_hash text default null,
  p_room_id uuid default null,
  p_started_on date default null,
  p_note text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  r public.account_requests%rowtype;
  room_rec public.rooms%rowtype;
  assigned_tenant_id uuid;
  start_date date;
  occupied_count integer;
begin
  if mapsilip_private.operational_role() <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  select * into r from public.account_requests where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then
    if r.status = p_decision then
      if r.status = 'approved' then
        select ro.id, ro.room_number into room_rec.id, room_rec.room_number
        from public.room_assignments ra
        join public.rooms ro on ro.id = ra.room_id
        where ra.tenant_id = r.activated_user_id and ra.ended_on is null
        limit 1;
        return jsonb_build_object(
          'state', 'approved',
          'room_id', room_rec.id,
          'room_number', room_rec.room_number,
          'email', r.email,
          'display_name', r.display_name
        );
      else
        return jsonb_build_object(
          'state', 'rejected',
          'email', r.email,
          'display_name', r.display_name,
          'rejection_reason', r.rejection_reason
        );
      end if;
    end if;
    raise exception 'already reviewed' using errcode = '23505';
  end if;

  if p_decision = 'rejected' then
    p_note := nullif(trim(p_note), '');
    if p_note is null or length(p_note) > 500 then
      raise exception 'rejection reason required' using errcode = '22023';
    end if;
    update public.account_requests set
      status = 'rejected',
      reviewer_id = actor,
      reviewed_at = now(),
      rejection_reason = p_note,
      updated_at = now()
    where id = p_id;

    if r.activated_user_id is not null then
      insert into public.notifications(recipient_id, title, body, href, event_key)
        values(
          r.activated_user_id,
          'Account request rejected',
          left('Your tenant access request was not approved: ' || p_note, 500),
          '/request-account',
          'account-request:' || p_id::text || ':rejected'
        )
        on conflict (event_key) do nothing;
    end if;

    insert into public.operational_audit(actor_id, action, record_id, reason)
      values(actor, 'account_request.rejected', p_id, p_note);

    return jsonb_build_object(
      'state', 'rejected',
      'email', r.email,
      'display_name', r.display_name,
      'rejection_reason', p_note
    );
  end if;

  -- Decision is approved: enforce room assignment
  if p_room_id is null then
    raise exception 'room assignment required for approval' using errcode = '22023';
  end if;

  select * into room_rec from public.rooms where id = p_room_id for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if room_rec.availability <> 'available' then
    raise exception 'room unavailable for assignment' using errcode = '23514';
  end if;

  select count(*) into occupied_count from public.room_assignments
    where room_id = p_room_id and ended_on is null;
  if occupied_count >= room_rec.capacity then
    raise exception 'room is at full capacity' using errcode = '23514';
  end if;

  assigned_tenant_id := r.activated_user_id;
  if assigned_tenant_id is null or not exists (
    select 1 from auth.users u where u.id = assigned_tenant_id
      and lower(u.email) = r.email and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  ) or exists (select 1 from mapsilip_private.accounts a where a.user_id = assigned_tenant_id)
    or exists (select 1 from public.tenant_profiles p where p.user_id = assigned_tenant_id) then
    raise exception 'tenant auth user not found' using errcode = 'P0002';
  end if;

  start_date := coalesce(p_started_on, current_date);

  -- Update account_request
  update public.account_requests set
    status = 'approved',
    reviewer_id = actor,
    reviewed_at = now(),
    activated_user_id = assigned_tenant_id,
    updated_at = now()
  where id = p_id;

  -- A pending request cannot silently reactivate an existing tenant.
  insert into public.tenant_profiles(user_id, display_name, phone, status)
    values (assigned_tenant_id, r.display_name, r.phone, 'active');

  -- Create active room assignment
  insert into public.room_assignments(tenant_id, room_id, started_on, created_by)
    values (assigned_tenant_id, p_room_id, start_date, actor);

  -- Insert approval notification for tenant
  insert into public.notifications(recipient_id, title, body, href, event_key)
    values(
      assigned_tenant_id,
      'Account approved',
      'Your tenant account has been approved and assigned to Room ' || room_rec.room_number || '.',
      '/tenant',
      'account-request:' || p_id::text || ':approved'
    )
    on conflict (event_key) do nothing;

  insert into public.operational_audit(actor_id, action, record_id, reason)
    values(actor, 'account_request.approved', p_id, 'Assigned to Room ' || room_rec.room_number);

  return jsonb_build_object(
    'state', 'approved',
    'room_id', p_room_id,
    'room_number', room_rec.room_number,
    'email', r.email,
    'display_name', r.display_name
  );
end;
$$;

-- Preserve access for already active legacy tenants without a room.
-- New approvals atomically create both the profile and room assignment.
create or replace function mapsilip_private.tenant_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not exists (select 1 from mapsilip_private.accounts a where a.user_id = auth.uid())
    and exists (select 1 from public.tenant_profiles p where p.user_id = auth.uid() and p.status = 'active')
    and exists (select 1 from auth.users u where u.id = auth.uid() and u.deleted_at is null
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now()))
    and exists (select 1 from auth.sessions s where s.user_id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id' and (s.not_after is null or s.not_after > now()));
$$;

-- Preserve the existing staff admission checks and active tenant profile gate.
create or replace function mapsilip_private.operational_role() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sid_text text := auth.jwt()->>'session_id'; sid uuid;
  a mapsilip_private.accounts%rowtype; tenant_status text;
begin
  if uid is null or sid_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  sid := sid_text::uuid;
  if not exists (select 1 from auth.users u join auth.sessions s on s.user_id = u.id
     where u.id = uid and s.id = sid and u.deleted_at is null
       and (u.banned_until is null or u.banned_until <= now())
       and (s.not_after is null or s.not_after > now())) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into a from mapsilip_private.accounts where user_id = uid for update;
  if found then
    if a.status <> 'active' or a.password_change_required or not exists (
      select 1 from mapsilip_private.session_admissions g where g.user_id = uid
        and g.auth_session_id = sid and g.security_revision = a.security_revision) then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    return a.role;
  end if;
  select p.status into tenant_status from public.tenant_profiles p where p.user_id = uid for update;
  if tenant_status = 'active'
    and exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null) then
    return 'tenant';
  end if;
  raise exception 'not authorized' using errcode = '42501';
end;
$$;

-- Return applicant status and rejection reason safely for sign-in feedback
create or replace function mapsilip_private.applicant_status(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
begin
  if p_user_id is null then return null; end if;
  select status, rejection_reason, display_name into r
  from public.account_requests
  where activated_user_id = p_user_id
  order by created_at desc
  limit 1;

  if not found then return null; end if;
  return jsonb_build_object(
    'status', r.status,
    'rejection_reason', r.rejection_reason,
    'display_name', r.display_name
  );
end;
$$;

-- Allow applicants to inspect their own account request state
drop policy if exists account_requests_applicant_read on public.account_requests;
create policy account_requests_applicant_read on public.account_requests for select to authenticated
  using (activated_user_id = (select auth.uid()));

-- Allow rejected and pending applicants to read their in-app notifications
drop policy if exists notifications_recipient_read on public.notifications;
create policy notifications_recipient_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and
    ((select mapsilip_private.tenant_active())
     or (select mapsilip_private.can_read('staff.access.inspect'))
     or exists (select 1 from public.account_requests ar where ar.activated_user_id = (select auth.uid()) and (ar.status = 'rejected' or ar.status = 'pending'))
    ));

-- Durable email events tracking for transactional email delivery, deduplication, and retry state
create table if not exists mapsilip_private.email_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique check (length(event_key) between 4 and 180),
  recipient text not null check (length(recipient) between 3 and 320),
  subject text not null check (length(subject) between 1 and 200),
  payload jsonb,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'unconfigured', 'review_required')),
  attempts integer not null default 0 check (attempts >= 0),
  claim_token uuid,
  claim_generation integer not null default 0 check (claim_generation >= 0),
  claimed_at timestamptz,
  last_error text check (last_error is null or (length(last_error) <= 64 and last_error ~ '^[a-z0-9_]+$')),
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mapsilip_private.email_events add column if not exists payload jsonb;
alter table mapsilip_private.email_events add column if not exists claim_token uuid;
alter table mapsilip_private.email_events add column if not exists claim_generation integer not null default 0;
alter table mapsilip_private.email_events add column if not exists claimed_at timestamptz;

create or replace function mapsilip_private.claim_or_record_email_event(
  p_event_key text,
  p_recipient text,
  p_subject text,
  p_payload jsonb default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  r mapsilip_private.email_events%rowtype;
  v_token uuid := gen_random_uuid();
begin
  p_event_key := trim(p_event_key);
  p_recipient := lower(trim(p_recipient));
  p_subject := trim(p_subject);
  if length(p_event_key) not between 4 and 180
     or length(p_recipient) not between 3 and 320
     or length(p_subject) not between 1 and 200 then
    raise exception 'invalid email event' using errcode = '22023';
  end if;

  -- Attempt initial insert with status = 'sending', attempts = 1, claim_generation = 1, claim_token = v_token, claimed_at = now()
  insert into mapsilip_private.email_events(
    event_key, recipient, subject, payload, status, attempts, claim_generation, claim_token, claimed_at
  ) values (
    p_event_key, p_recipient, p_subject, p_payload, 'sending', 1, 1, v_token, now()
  )
  on conflict (event_key) do nothing
  returning * into r;

  if r.id is not null then
    return jsonb_build_object(
      'id', r.id,
      'event_key', r.event_key,
      'status', r.status,
      'claimed', true,
      'claim_token', r.claim_token,
      'claim_generation', r.claim_generation,
      'attempts', r.attempts
    );
  end if;

  -- Row exists; acquire exclusive row lock
  select * into r from mapsilip_private.email_events
    where event_key = p_event_key
    for update;

  if not found then
    raise exception 'email event disappeared' using errcode = 'P0002';
  end if;

  -- A provider idempotency key must never be reused with a different recipient or attempted payload.
  if r.status not in ('sent', 'skipped') and
     (r.recipient <> p_recipient or r.subject <> p_subject or
      (r.status in ('failed', 'sending', 'pending') and p_payload is not null and r.payload is distinct from p_payload)) then
    update mapsilip_private.email_events set status = 'review_required',
      claim_token = null, claimed_at = null, last_error = 'email_payload_changed', updated_at = now()
      where id = r.id and status not in ('sent', 'skipped');
    r.status := 'review_required';
  end if;

  -- Already terminal: duplicate suppressed
  if r.status not in ('sent', 'skipped', 'review_required') and
     (r.attempts >= 5 or (r.status in ('failed', 'sending') and r.created_at < now() - interval '23 hours')) then
    update mapsilip_private.email_events set status = 'review_required', claim_token = null,
      claimed_at = null, updated_at = now() where id = r.id;
    r.status := 'review_required';
  end if;
  if r.status in ('sent', 'skipped', 'review_required') then
    return jsonb_build_object(
      'id', r.id,
      'event_key', r.event_key,
      'status', r.status,
      'claimed', false,
      'claim_token', r.claim_token,
      'claim_generation', r.claim_generation,
      'attempts', r.attempts
    );
  end if;

  -- Concurrent in-flight delivery within 5 minutes: suppress duplicate send
  if r.status = 'sending' and r.claimed_at is not null and r.claimed_at >= now() - interval '5 minutes' then
    return jsonb_build_object(
      'id', r.id,
      'event_key', r.event_key,
      'status', r.status,
      'claimed', false,
      'claim_token', r.claim_token,
      'claim_generation', r.claim_generation,
      'attempts', r.attempts
    );
  end if;

  -- Either failed, pending, unconfigured, or abandoned sending (> 5 minutes): safe recovery claim
  update mapsilip_private.email_events set
    status = 'sending',
    payload = coalesce(p_payload, payload),
    attempts = attempts + 1,
    claim_generation = claim_generation + 1,
    claim_token = v_token,
    claimed_at = now(),
    updated_at = now()
  where event_key = p_event_key
  returning * into r;

  return jsonb_build_object(
    'id', r.id,
    'event_key', r.event_key,
    'status', r.status,
    'claimed', true,
    'claim_token', r.claim_token,
    'claim_generation', r.claim_generation,
    'attempts', r.attempts
  );
end;
$$;

create or replace function mapsilip_private.record_email_event(
  p_event_key text,
  p_recipient text,
  p_subject text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  return mapsilip_private.claim_or_record_email_event(p_event_key, p_recipient, p_subject, null);
end;
$$;

create or replace function mapsilip_private.complete_email_event(
  p_event_key text,
  p_status text,
  p_claim_token uuid,
  p_claim_generation integer,
  p_error text default null,
  p_message_id text default null
) returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  p_event_key := trim(p_event_key);
  if p_status not in ('sent', 'failed', 'skipped', 'unconfigured', 'review_required')
     or p_claim_token is null or p_claim_generation is null or p_claim_generation < 1
     or (p_error is not null and (length(p_error) > 64 or p_error !~ '^[a-z0-9_]+$')) then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  -- A stale or missing lease can never complete another worker's claim.
  update mapsilip_private.email_events set
    status = p_status,
    claimed_at = null,
    claim_token = null,
    last_error = p_error,
    provider_message_id = coalesce(p_message_id, provider_message_id),
    updated_at = now()
  where event_key = p_event_key
    and status = 'sending'
    and claim_token = p_claim_token
    and claim_generation = p_claim_generation;

  return found;
end;
$$;

create or replace function mapsilip_private.claim_pending_email_events(
  p_limit integer default 10
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_rec record;
  v_token uuid;
  v_claimed_events jsonb := '[]'::jsonb;
begin
  -- Uncertain outcomes older than the provider's idempotency window require review.
  update mapsilip_private.email_events set status = 'review_required', updated_at = now()
  where (status in ('failed', 'unconfigured', 'pending', 'sending'))
    and (status <> 'sending' or claimed_at < now() - interval '5 minutes')
    and (attempts >= 5 or (status in ('failed', 'sending') and created_at < now() - interval '23 hours'));

  for v_rec in
    select id, event_key, recipient, subject, payload, status, attempts, claim_generation
    from mapsilip_private.email_events
    where (
      (status in ('pending', 'unconfigured') and attempts < 5)
      or (status = 'failed' and attempts < 5 and updated_at <= now() -
        make_interval(mins => case attempts when 1 then 1 when 2 then 2 when 3 then 4 else 8 end))
      or (status = 'sending' and claimed_at < now() - interval '5 minutes' and attempts < 5)
    )
    order by updated_at asc
    limit v_limit
    for update skip locked
  loop
    v_token := gen_random_uuid();
    update mapsilip_private.email_events set
      status = 'sending',
      attempts = attempts + 1,
      claim_generation = claim_generation + 1,
      claim_token = v_token,
      claimed_at = now(),
      updated_at = now()
    where id = v_rec.id;

    v_claimed_events := v_claimed_events || jsonb_build_array(jsonb_build_object(
      'id', v_rec.id,
      'event_key', v_rec.event_key,
      'recipient', v_rec.recipient,
      'subject', v_rec.subject,
      'payload', v_rec.payload,
      'previous_status', v_rec.status,
      'claim_token', v_token,
      'claim_generation', v_rec.claim_generation + 1,
      'attempts', v_rec.attempts + 1
    ));
  end loop;

  return v_claimed_events;
end;
$$;

create or replace function mapsilip_private.email_retry_health()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'review_required', count(*) filter (where status = 'review_required'),
    'unresolved', count(*) filter (where status in ('pending', 'sending', 'failed', 'unconfigured'))
  ) from mapsilip_private.email_events;
$$;

create or replace function mapsilip_private.approval_email_room(p_request_id uuid, p_recipient text)
returns text language sql stable security definer set search_path = '' as $$
  select ro.room_number
  from public.account_requests ar
  join auth.users u on u.id = ar.activated_user_id
  join public.room_assignments ra on ra.tenant_id = u.id and ra.ended_on is null
  join public.rooms ro on ro.id = ra.room_id
  where ar.id = p_request_id and ar.status in ('approved', 'activated')
    and ar.email = lower(p_recipient) and lower(u.email) = ar.email
    and u.email_confirmed_at is not null and u.deleted_at is null
  limit 1;
$$;

-- Legacy invitation compatibility: require active room assignment before activation
create or replace function mapsilip_private.claim_account(p_id uuid, p_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sid text := auth.jwt()->>'session_id'; r public.account_requests%rowtype;
  verified_email text;
begin
  if uid is null or sid is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'not authorized' using errcode = '42501'; end if;
  select lower(u.email) into verified_email from auth.users u join auth.sessions s on s.user_id = u.id
    where u.id = uid and s.id::text = sid and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now()) and (s.not_after is null or s.not_after > now());
  if verified_email is null or exists (select 1 from mapsilip_private.accounts a where a.user_id = uid) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into r from public.account_requests where id = p_id for update;
  if not found or r.status <> 'approved' or r.invitation_hash <> p_hash
     or r.invitation_expires_at <= now() or r.email <> verified_email then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- A legacy claim cannot create its own profile or assignment. Both must have
  -- been prepared by an owner; otherwise use the transactional reconciliation RPC.
  if not exists (
    select 1 from public.tenant_profiles p
    where p.user_id = uid and p.status = 'inactive'
  ) or not exists (
    select 1 from public.room_assignments ra
    where ra.tenant_id = uid
      and ra.ended_on is null
  ) then
    raise exception 'owner reconciliation required before activation' using errcode = '22023';
  end if;

  -- The prepared assignment belongs to the authenticated claimant.
  update public.tenant_profiles set status = 'active', updated_at = now()
    where user_id = uid;

  update public.account_requests set status = 'activated', activated_user_id = uid, updated_at = now() where id = p_id;
  insert into public.notifications(recipient_id,title,body,href,event_key)
    values(uid,'Account ready','Your tenant account is active.','/tenant','account-request:' || p_id::text || ':activated')
    on conflict (event_key) do nothing;
  insert into public.operational_audit(actor_id,action,record_id) values(uid,'account_request.activated',p_id);
  return jsonb_build_object('state','activated');
end;
$$;

-- Inventory legacy approved invitations without active room assignments
create or replace function mapsilip_private.inventory_legacy_invitations()
returns table (
  id uuid,
  email text,
  display_name text,
  phone text,
  status text,
  reviewed_at timestamptz,
  activated_user_id uuid,
  has_profile boolean,
  has_active_assignment boolean,
  reconciliation_needed boolean
) language plpgsql volatile security definer set search_path = '' as $$
begin
  if mapsilip_private.operational_role() <> 'owner' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query select
    ar.id,
    ar.email,
    ar.display_name,
    ar.phone,
    ar.status,
    ar.reviewed_at,
    ar.activated_user_id,
    exists (select 1 from public.tenant_profiles tp where tp.user_id = ar.activated_user_id) as has_profile,
    exists (select 1 from public.room_assignments ra where ra.tenant_id = ar.activated_user_id and ra.ended_on is null) as has_active_assignment,
    (ar.status = 'approved' and not exists (
      select 1 from public.room_assignments ra where ra.tenant_id = ar.activated_user_id and ra.ended_on is null
    )) as reconciliation_needed
  from public.account_requests ar
  where ar.status in ('approved', 'pending')
  order by ar.created_at desc;
end;
$$;

-- Explicit, non-destructive reconciliation path for legacy approved invitations
create or replace function mapsilip_private.reconcile_legacy_invitation(
  p_id uuid,
  p_action text,
  p_room_id uuid default null,
  p_user_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  r public.account_requests%rowtype;
  room_rec public.rooms%rowtype;
  occupied_count integer;
  target_user_id uuid;
begin
  if mapsilip_private.operational_role() <> 'owner' then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_action is null or p_action not in ('reset_to_pending', 'assign_room') then
    raise exception 'invalid action' using errcode = '22023';
  end if;

  select * into r from public.account_requests where id = p_id for update;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  if r.status <> 'approved' then
    raise exception 'request not approved' using errcode = '22023';
  end if;
  if r.invitation_hash is null then
    raise exception 'not a legacy invitation' using errcode = '22023';
  end if;

  if p_user_id is not null and r.activated_user_id is not null
     and r.activated_user_id is distinct from p_user_id then
    raise exception 'identity mismatch' using errcode = '42501';
  end if;
  target_user_id := coalesce(r.activated_user_id, p_user_id);
  if target_user_id is null or not exists (
    select 1 from auth.users u where u.id = target_user_id
      and lower(u.email) = r.email and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
  ) or exists (select 1 from mapsilip_private.accounts a where a.user_id = target_user_id)
    or exists (select 1 from public.account_requests ar where ar.activated_user_id = target_user_id and ar.id <> p_id)
    or exists (select 1 from public.tenant_profiles p where p.user_id = target_user_id and p.status = 'active') then
    raise exception 'request identity unavailable' using errcode = '42501';
  end if;

  -- Ensure we do not overwrite an existing legitimate active assignment
  if exists (
    select 1 from public.room_assignments where tenant_id = target_user_id and ended_on is null
  ) then
    raise exception 'already assigned' using errcode = '23505';
  end if;

  if p_action = 'reset_to_pending' then
    if exists (select 1 from public.tenant_profiles where user_id = target_user_id) then
      raise exception 'existing profile requires review' using errcode = '23505';
    end if;
    update public.account_requests set
      status = 'pending',
      activated_user_id = target_user_id,
      reviewer_id = null,
      reviewed_at = null,
      invitation_hash = null,
      invitation_expires_at = null,
      updated_at = now()
    where id = p_id;

    insert into public.operational_audit(actor_id, action, record_id, reason)
      values(actor, 'account_request.reconciled_to_pending', p_id, 'Reset unassigned legacy approval to pending');

    return jsonb_build_object('state', 'pending', 'id', p_id);

  elsif p_action = 'assign_room' then
    if p_room_id is null then
      raise exception 'room assignment required' using errcode = '22023';
    end if;

    select * into room_rec from public.rooms where id = p_room_id for update;
    if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
    if room_rec.availability <> 'available' then
      raise exception 'room unavailable for assignment' using errcode = '23514';
    end if;

    select count(*) into occupied_count from public.room_assignments
      where room_id = p_room_id and ended_on is null;
    if occupied_count >= room_rec.capacity then
      raise exception 'room is at full capacity' using errcode = '23514';
    end if;

    insert into public.tenant_profiles(user_id, display_name, phone, status)
      values (target_user_id, r.display_name, r.phone, 'active')
      on conflict (user_id) do update set status = 'active';

    insert into public.room_assignments(tenant_id, room_id, started_on, created_by)
      values (target_user_id, p_room_id, current_date, actor);

    update public.account_requests set status = 'activated', activated_user_id = target_user_id,
      reviewer_id = actor, updated_at = now() where id = p_id;
    insert into public.notifications(recipient_id, title, body, href, event_key)
      values(target_user_id, 'Account ready',
        'Your tenant account is active and assigned to Room ' || room_rec.room_number || '.',
        '/tenant', 'account-request:' || p_id::text || ':activated')
      on conflict (event_key) do nothing;

    insert into public.operational_audit(actor_id, action, record_id, reason)
      values(actor, 'account_request.legacy_room_assigned', p_id, 'Assigned to Room ' || room_rec.room_number);

    return jsonb_build_object(
      'state', 'activated',
      'id', p_id,
      'room_id', p_room_id,
      'room_number', room_rec.room_number
    );
  end if;

  return jsonb_build_object('state', 'unknown');
end;
$$;

alter table mapsilip_private.email_events owner to postgres;
alter function mapsilip_private.claim_or_record_email_event(text, text, text, jsonb) owner to postgres;
alter function mapsilip_private.record_email_event(text, text, text) owner to postgres;
alter function mapsilip_private.complete_email_event(text, text, uuid, integer, text, text) owner to postgres;
alter function mapsilip_private.claim_pending_email_events(integer) owner to postgres;
alter function mapsilip_private.email_retry_health() owner to postgres;
alter function mapsilip_private.approval_email_room(uuid, text) owner to postgres;
alter function mapsilip_private.claim_account(uuid, text) owner to postgres;
alter function mapsilip_private.inventory_legacy_invitations() owner to postgres;
alter function mapsilip_private.reconcile_legacy_invitation(uuid, text, uuid, uuid) owner to postgres;

revoke all on table mapsilip_private.email_events from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.claim_or_record_email_event(text, text, text, jsonb) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.record_email_event(text, text, text) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.complete_email_event(text, text, uuid, integer, text, text) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.claim_pending_email_events(integer) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.email_retry_health() from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.approval_email_room(uuid, text) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.claim_account(uuid, text) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.inventory_legacy_invitations() from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.reconcile_legacy_invitation(uuid, text, uuid, uuid) from public, anon, authenticated, service_role, mapsilip_security_executor;

grant execute on function mapsilip_private.claim_or_record_email_event(text, text, text, jsonb) to mapsilip_security_executor;
grant execute on function mapsilip_private.record_email_event(text, text, text) to mapsilip_security_executor;
grant execute on function mapsilip_private.complete_email_event(text, text, uuid, integer, text, text) to mapsilip_security_executor;
grant execute on function mapsilip_private.claim_pending_email_events(integer) to mapsilip_security_executor;
grant execute on function mapsilip_private.email_retry_health() to mapsilip_security_executor;
grant execute on function mapsilip_private.approval_email_room(uuid, text) to mapsilip_security_executor;
grant execute on function mapsilip_private.claim_account(uuid, text) to authenticated;
grant execute on function mapsilip_private.inventory_legacy_invitations() to authenticated;
grant execute on function mapsilip_private.reconcile_legacy_invitation(uuid, text, uuid, uuid) to authenticated;

-- Public RPC wrapper
-- The previous three-argument approval RPC could approve without a room.
drop function public.mapsilip_review_account_request(uuid,text,text);
drop function mapsilip_private.review_account_request(uuid,text,text);
drop function mapsilip_private.submit_account_request(text,text,text);

create or replace function public.mapsilip_review_account_request(
  p_id uuid,
  p_decision text,
  p_invitation_hash text default null,
  p_room_id uuid default null,
  p_started_on date default null,
  p_note text default null
) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select mapsilip_private.review_account_request(p_id, p_decision, p_invitation_hash, p_room_id, p_started_on, p_note);
$$;

create or replace function public.mapsilip_reconcile_legacy_invitation(
  p_id uuid,
  p_action text,
  p_room_id uuid default null,
  p_user_id uuid default null
) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select mapsilip_private.reconcile_legacy_invitation(p_id, p_action, p_room_id, p_user_id);
$$;

create or replace function public.mapsilip_inventory_legacy_invitations()
returns table (
  id uuid, email text, display_name text, phone text, status text,
  reviewed_at timestamptz, activated_user_id uuid, has_profile boolean,
  has_active_assignment boolean, reconciliation_needed boolean
) language sql volatile security invoker set search_path = '' as $$
  select * from mapsilip_private.inventory_legacy_invitations();
$$;

alter function mapsilip_private.submit_account_request(text,text,text,uuid) owner to postgres;
alter function mapsilip_private.review_account_request(uuid,text,text,uuid,date,text) owner to postgres;
alter function mapsilip_private.applicant_status(uuid) owner to postgres;
alter function mapsilip_private.tenant_active() owner to postgres;
alter function mapsilip_private.operational_role() owner to postgres;
alter function public.mapsilip_review_account_request(uuid,text,text,uuid,date,text) owner to postgres;
alter function public.mapsilip_reconcile_legacy_invitation(uuid,text,uuid,uuid) owner to postgres;
alter function public.mapsilip_inventory_legacy_invitations() owner to postgres;

revoke all on function mapsilip_private.submit_account_request(text,text,text,uuid) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.review_account_request(uuid,text,text,uuid,date,text) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function mapsilip_private.applicant_status(uuid) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function public.mapsilip_review_account_request(uuid,text,text,uuid,date,text) from public, anon, authenticated, service_role;
revoke all on function public.mapsilip_reconcile_legacy_invitation(uuid,text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.mapsilip_inventory_legacy_invitations() from public, anon, authenticated, service_role;

grant execute on function mapsilip_private.submit_account_request(text,text,text,uuid) to mapsilip_security_executor;
grant execute on function mapsilip_private.review_account_request(uuid,text,text,uuid,date,text) to authenticated;
grant execute on function mapsilip_private.applicant_status(uuid) to mapsilip_security_executor;
grant execute on function public.mapsilip_review_account_request(uuid,text,text,uuid,date,text) to authenticated;
grant execute on function public.mapsilip_reconcile_legacy_invitation(uuid,text,uuid,uuid) to authenticated;
grant execute on function public.mapsilip_inventory_legacy_invitations() to authenticated;

commit;
