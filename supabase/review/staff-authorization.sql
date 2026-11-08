-- REVIEW CANDIDATE ONLY. Not a migration and never executed by app code.
-- Requires explicit hosted approval, collision/ACL review and synthetic runtime tests.
-- Creates authority only; it creates no staff accounts or business records.
begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Apply this review candidate only as postgres so object ownership is predictable';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'mapsilip_security_executor') then
    raise exception 'mapsilip_security_executor already exists; review the collision';
  end if;
  execute 'create role mapsilip_security_executor login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls';
end;
$$;

create schema mapsilip_private;
revoke all on schema mapsilip_private from public, anon, authenticated, service_role;
-- Functions created later by postgres in this private schema must not inherit
-- PostgreSQL's default PUBLIC EXECUTE grant. Existing functions are also
-- explicitly revoked below before the two intentional grants are applied.
alter default privileges for role postgres in schema mapsilip_private
  revoke execute on functions from public;

create table mapsilip_private.accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'caretaker')),
  status text not null default 'deactivated' check (status in ('active', 'deactivated')),
  password_change_required boolean not null default true,
  security_revision bigint not null default 1 check (security_revision > 0)
);
create table mapsilip_private.session_admissions (
  user_id uuid not null references mapsilip_private.accounts(user_id) on delete restrict,
  auth_session_id uuid not null,
  security_revision bigint not null check (security_revision > 0),
  admitted_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (user_id, auth_session_id)
);
create table mapsilip_private.auth_attempts (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  kind text not null check (kind in ('staff_signin', 'staff_password_change')),
  user_id uuid not null references mapsilip_private.accounts(user_id) on delete restrict,
  expected_revision bigint not null check (expected_revision > 0),
  starting_session_id uuid,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  result text check (result in ('restricted', 'admitted', 'completed')),
  receipt_session_id uuid,
  receipt_revision bigint,
  check (
    (result is not distinct from 'completed'
      and receipt_session_id is not null and receipt_revision is not null)
    or
    (result is distinct from 'completed'
      and receipt_session_id is null and receipt_revision is null)
  )
);
create unique index auth_attempts_one_pending_password_change
  on mapsilip_private.auth_attempts (user_id)
  where kind = 'staff_password_change' and consumed_at is null;
create index auth_attempts_user_created on mapsilip_private.auth_attempts (user_id, created_at desc);
create table mapsilip_private.signin_rate_limits (
  bucket_kind text not null check (bucket_kind in ('identifier', 'client')),
  bucket_hash text not null check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null,
  primary key (bucket_kind, bucket_hash, window_started_at)
);
create index signin_rate_limits_expiry on mapsilip_private.signin_rate_limits (expires_at);
create table mapsilip_private.security_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'staff_signin_admitted', 'staff_first_login_completed', 'staff_account_security_changed')),
  actor_user_id uuid,
  target_user_id uuid not null,
  auth_session_id uuid,
  security_revision bigint,
  occurred_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table mapsilip_private.accounts enable row level security;
alter table mapsilip_private.session_admissions enable row level security;
alter table mapsilip_private.auth_attempts enable row level security;
alter table mapsilip_private.signin_rate_limits enable row level security;
alter table mapsilip_private.security_events enable row level security;
revoke all on all tables in schema mapsilip_private from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on all sequences in schema mapsilip_private from public, anon, authenticated, service_role, mapsilip_security_executor;

create function mapsilip_private.advance_security_revision() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- Every authority-row update invalidates prior attempt/admission snapshots,
  -- including credential reissue while the restriction is already set.
  new.security_revision := old.security_revision + 1;
  if new.user_id is distinct from old.user_id then raise exception 'Staff identity is immutable'; end if;
  if new.status is distinct from old.status or new.role is distinct from old.role then
    new.password_change_required := true;
  end if;
  return new;
end;
$$;
create trigger accounts_advance_security_revision before update on mapsilip_private.accounts
for each row execute function mapsilip_private.advance_security_revision();

create function mapsilip_private.audit_account_security_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into mapsilip_private.security_events(event_type, actor_user_id, target_user_id, auth_session_id, security_revision)
    values ('staff_account_security_changed', auth.uid(), new.user_id,
      case when (auth.jwt() ->> 'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        then (auth.jwt() ->> 'session_id')::uuid else null end, new.security_revision);
  return new;
end;
$$;
create trigger accounts_audit_security_change after update on mapsilip_private.accounts
for each row execute function mapsilip_private.audit_account_security_change();

-- STABLE, non-locking, no-write predicate: safe for PostgREST GET/HEAD and RLS.
create function mapsilip_private.can_read(requested_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); sid_text text := auth.jwt() ->> 'session_id'; sid uuid;
  account mapsilip_private.accounts%rowtype;
begin
  if uid is null or sid_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then return false; end if;
  sid := sid_text::uuid;
  select a.* into account from mapsilip_private.accounts a where a.user_id = uid;
  if not found or account.status <> 'active' or account.password_change_required then return false; end if;
  if not exists (
    select 1 from mapsilip_private.session_admissions a
    join auth.sessions s on s.id = a.auth_session_id and s.user_id = a.user_id
    join auth.users u on u.id = a.user_id
    where a.user_id = uid and a.auth_session_id = sid and a.security_revision = account.security_revision
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= pg_catalog.now())
      and (s.not_after is null or s.not_after > pg_catalog.now())
  ) then return false; end if;
  return requested_action = 'staff.access.inspect' or
    (account.role = 'owner' and requested_action in (
      'tenant.application.approve', 'tenant.application.reject', 'room.assign', 'room.move',
      'finance.read', 'invoice.correct', 'payment.reverse'));
end;
$$;

create function mapsilip_private.staff_access_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); sid_text text := auth.jwt() ->> 'session_id'; sid uuid;
  account mapsilip_private.accounts%rowtype; admitted_revision bigint; session_active boolean := false;
begin
  if uid is null then return null; end if;
  select a.* into account from mapsilip_private.accounts a where a.user_id = uid;
  if not found then return null; end if;
  if sid_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    sid := sid_text::uuid;
    select exists (select 1 from auth.sessions s join auth.users u on u.id = s.user_id
      where s.id = sid and s.user_id = uid and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= pg_catalog.now())
        and (s.not_after is null or s.not_after > pg_catalog.now())) into session_active;
    select a.security_revision into admitted_revision from mapsilip_private.session_admissions a
      where a.user_id = uid and a.auth_session_id = sid;
  end if;
  return pg_catalog.jsonb_build_object('user_id', uid, 'session_id', sid, 'role', account.role,
    'status', account.status, 'password_change_required', account.password_change_required,
    'security_revision', account.security_revision::text, 'session_revision', admitted_revision::text,
    'auth_session_active', session_active);
end;
$$;

-- Proposed shared limiter: 6 identifier and 30 client attempts per 15-minute window.
-- Keys are server-HMAC pseudonyms; no raw identifier or address is stored.
create function mapsilip_private.consume_signin_rate_limit(identifier_hash text, client_hash text)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare
  -- EXTRACT is special SQL syntax, not a schema-qualified callable function.
  window_start timestamptz := pg_catalog.to_timestamp(
    pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) / 900) * 900);
  identifier_count integer; client_count integer;
begin
  if identifier_hash !~ '^[0-9a-f]{64}$' or client_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from mapsilip_private.signin_rate_limits where expires_at <= pg_catalog.clock_timestamp();
  insert into mapsilip_private.signin_rate_limits as limits(bucket_kind, bucket_hash, window_started_at, attempts, expires_at)
    values ('identifier', identifier_hash, window_start, 1, window_start + interval '15 minutes')
    on conflict (bucket_kind, bucket_hash, window_started_at) do update set attempts = limits.attempts + 1
      where limits.attempts < 6 returning attempts into identifier_count;
  if identifier_count is null then return false; end if;
  insert into mapsilip_private.signin_rate_limits as limits(bucket_kind, bucket_hash, window_started_at, attempts, expires_at)
    values ('client', client_hash, window_start, 1, window_start + interval '15 minutes')
    on conflict (bucket_kind, bucket_hash, window_started_at) do update set attempts = limits.attempts + 1
      where limits.attempts < 30 returning attempts into client_count;
  return client_count is not null;
end;
$$;

create function mapsilip_private.begin_staff_signin(login_identifier text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare account mapsilip_private.accounts%rowtype; attempt_id uuid;
begin
  if login_identifier is null or pg_catalog.length(login_identifier) > 320 or login_identifier <> pg_catalog.btrim(login_identifier) then return null; end if;
  select a.* into account from mapsilip_private.accounts a join auth.users u on u.id = a.user_id
    where pg_catalog.lower(u.email) = pg_catalog.lower(login_identifier)
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= pg_catalog.now()) for update of a;
  if not found then return null; end if;
  insert into mapsilip_private.auth_attempts(kind, user_id, expected_revision, expires_at)
    values ('staff_signin', account.user_id, account.security_revision, pg_catalog.clock_timestamp() + interval '5 minutes') returning id into attempt_id;
  return pg_catalog.jsonb_build_object('attempt_id', attempt_id, 'user_id', account.user_id,
    'expected_revision', account.security_revision::text, 'status', account.status,
    'password_change_required', account.password_change_required, 'role', account.role,
    'expires_at', (select x.expires_at from mapsilip_private.auth_attempts x where x.id = attempt_id));
end;
$$;

create function mapsilip_private.finish_staff_signin(attempt_id uuid, verified_user_id uuid, verified_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare attempt mapsilip_private.auth_attempts%rowtype; account mapsilip_private.accounts%rowtype;
  target_user_id uuid; result_kind text;
begin
  select x.user_id into target_user_id from mapsilip_private.auth_attempts x where x.id = attempt_id;
  if not found then return null; end if;
  select a.* into account from mapsilip_private.accounts a where a.user_id = target_user_id for update;
  if not found then return null; end if;
  select x.* into attempt from mapsilip_private.auth_attempts x where x.id = attempt_id for update;
  if not found then return null; end if;
  if not found or attempt.kind <> 'staff_signin' or attempt.consumed_at is not null
    or attempt.expires_at <= pg_catalog.clock_timestamp() or attempt.expected_revision <> account.security_revision
    or account.status <> 'active' or verified_user_id <> account.user_id
    or not exists (select 1 from auth.users u where u.id = verified_user_id
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= pg_catalog.now()))
    or not exists (select 1 from auth.sessions s where s.id = verified_session_id and s.user_id = verified_user_id
      and (s.not_after is null or s.not_after > pg_catalog.now())) then return null; end if;
  if account.password_change_required then result_kind := 'restricted';
  else
    insert into mapsilip_private.session_admissions(user_id, auth_session_id, security_revision)
      values (account.user_id, verified_session_id, account.security_revision);
    result_kind := 'admitted';
    insert into mapsilip_private.security_events(event_type, actor_user_id, target_user_id, auth_session_id, security_revision)
      values ('staff_signin_admitted', account.user_id, account.user_id, verified_session_id, account.security_revision);
  end if;
  update mapsilip_private.auth_attempts set consumed_at = pg_catalog.clock_timestamp(), result = result_kind where id = attempt.id;
  return pg_catalog.jsonb_build_object('result', result_kind, 'user_id', account.user_id,
    'session_id', verified_session_id, 'security_revision', account.security_revision::text, 'role', account.role);
end;
$$;

create function mapsilip_private.begin_first_login_change(verified_user_id uuid, starting_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare account mapsilip_private.accounts%rowtype; attempt_id uuid;
begin
  select a.* into account from mapsilip_private.accounts a where a.user_id = verified_user_id for update;
  if not found or account.status <> 'active' or not account.password_change_required
    or not exists (select 1 from auth.users u where u.id = verified_user_id
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= pg_catalog.now()))
    or not exists (select 1 from auth.sessions s where s.id = starting_session_id and s.user_id = verified_user_id
      and (s.not_after is null or s.not_after > pg_catalog.now())) then return null; end if;
  update mapsilip_private.auth_attempts set consumed_at = pg_catalog.clock_timestamp()
    where user_id = account.user_id and kind = 'staff_password_change' and consumed_at is null;
  insert into mapsilip_private.auth_attempts(kind, user_id, expected_revision, starting_session_id, expires_at)
    values ('staff_password_change', account.user_id, account.security_revision, starting_session_id,
      pg_catalog.clock_timestamp() + interval '5 minutes') returning id into attempt_id;
  return pg_catalog.jsonb_build_object('attempt_id', attempt_id, 'user_id', account.user_id,
    'expected_revision', account.security_revision::text, 'starting_session_id', starting_session_id,
    'role', account.role, 'status', account.status, 'password_change_required', account.password_change_required,
    'expires_at', (select x.expires_at from mapsilip_private.auth_attempts x where x.id = attempt_id));
end;
$$;

create function mapsilip_private.has_only_auth_session(verified_user_id uuid, candidate_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select pg_catalog.count(*) = 1 and pg_catalog.bool_and(s.id = candidate_session_id)
  from auth.sessions s where s.user_id = verified_user_id
    and (s.not_after is null or s.not_after > pg_catalog.now());
$$;

create function mapsilip_private.revoke_session_admission(p_user_id uuid, p_session_id uuid)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  perform 1 from mapsilip_private.accounts a where a.user_id = p_user_id for update;
  if not found then return false; end if;
  delete from mapsilip_private.session_admissions a
    where a.user_id = p_user_id and a.auth_session_id = p_session_id;
  return found;
end;
$$;

create function mapsilip_private.complete_first_login(attempt_id uuid, verified_user_id uuid,
  verified_session_id uuid, password_update_confirmed boolean, global_revocation_confirmed boolean)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare attempt mapsilip_private.auth_attempts%rowtype; account mapsilip_private.accounts%rowtype;
  target_user_id uuid; live_sessions integer;
begin
  select x.user_id into target_user_id from mapsilip_private.auth_attempts x where x.id = attempt_id;
  if not found then return null; end if;
  select a.* into account from mapsilip_private.accounts a where a.user_id = target_user_id for update;
  if not found then return null; end if;
  select x.* into attempt from mapsilip_private.auth_attempts x where x.id = attempt_id for update;
  if not found then return null; end if;
  if not found or attempt.kind <> 'staff_password_change' or attempt.consumed_at is not null
    or attempt.expires_at <= pg_catalog.clock_timestamp() or attempt.user_id <> account.user_id
    or verified_user_id <> account.user_id
    or attempt.expected_revision <> account.security_revision or account.status <> 'active'
    or not account.password_change_required or attempt.starting_session_id = verified_session_id
    or password_update_confirmed is not true or global_revocation_confirmed is not true
    or not exists (select 1 from auth.users u where u.id = verified_user_id
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= pg_catalog.now()))
    or not exists (select 1 from auth.sessions s where s.id = verified_session_id and s.user_id = verified_user_id
      and (s.not_after is null or s.not_after > pg_catalog.now())) then return null; end if;
  select pg_catalog.count(*) into live_sessions from auth.sessions s where s.user_id = verified_user_id
    and (s.not_after is null or s.not_after > pg_catalog.now());
  if live_sessions <> 1 then return null; end if;
  update mapsilip_private.accounts set password_change_required = false where user_id = verified_user_id returning * into account;
  insert into mapsilip_private.session_admissions(user_id, auth_session_id, security_revision)
    values (verified_user_id, verified_session_id, account.security_revision);
  update mapsilip_private.auth_attempts set consumed_at = pg_catalog.clock_timestamp(), result = 'completed',
    receipt_session_id = verified_session_id, receipt_revision = account.security_revision where id = attempt.id;
  insert into mapsilip_private.security_events(event_type, actor_user_id, target_user_id, auth_session_id, security_revision)
    values ('staff_first_login_completed', verified_user_id, verified_user_id, verified_session_id, account.security_revision);
  return pg_catalog.jsonb_build_object('result', 'completed', 'user_id', verified_user_id,
    'session_id', verified_session_id, 'security_revision', account.security_revision::text, 'role', account.role);
end;
$$;

create function mapsilip_private.reconcile_first_login(attempt_id uuid, verified_user_id uuid, verified_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare attempt mapsilip_private.auth_attempts%rowtype; account mapsilip_private.accounts%rowtype;
begin
  select x.* into attempt from mapsilip_private.auth_attempts x where x.id = attempt_id and x.user_id = verified_user_id;
  if not found then return null; end if;
  select a.* into account from mapsilip_private.accounts a where a.user_id = verified_user_id;
  if not found or attempt.kind <> 'staff_password_change' or attempt.result <> 'completed'
    or account.status <> 'active' or account.password_change_required
    or attempt.receipt_session_id <> verified_session_id or attempt.receipt_revision <> account.security_revision
    or not exists (select 1 from auth.users u where u.id = verified_user_id
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= pg_catalog.now()))
    or not exists (select 1 from mapsilip_private.session_admissions a where a.user_id = verified_user_id
      and a.auth_session_id = verified_session_id and a.security_revision = account.security_revision)
    or not exists (select 1 from auth.sessions s where s.id = verified_session_id and s.user_id = verified_user_id
      and (s.not_after is null or s.not_after > pg_catalog.now())) then return null; end if;
  return pg_catalog.jsonb_build_object('result', 'completed', 'user_id', verified_user_id,
    'session_id', verified_session_id, 'security_revision', account.security_revision::text, 'role', account.role);
end;
$$;

create function public.mapsilip_staff_access_snapshot() returns jsonb
language sql stable security invoker set search_path = '' as $$ select mapsilip_private.staff_access_snapshot(); $$;

alter function mapsilip_private.advance_security_revision() owner to postgres;
alter function mapsilip_private.audit_account_security_change() owner to postgres;
alter function mapsilip_private.can_read(text) owner to postgres;
alter function mapsilip_private.staff_access_snapshot() owner to postgres;
alter function mapsilip_private.consume_signin_rate_limit(text, text) owner to postgres;
alter function mapsilip_private.begin_staff_signin(text) owner to postgres;
alter function mapsilip_private.finish_staff_signin(uuid, uuid, uuid) owner to postgres;
alter function mapsilip_private.begin_first_login_change(uuid, uuid) owner to postgres;
alter function mapsilip_private.has_only_auth_session(uuid, uuid) owner to postgres;
alter function mapsilip_private.revoke_session_admission(uuid, uuid) owner to postgres;
alter function mapsilip_private.complete_first_login(uuid, uuid, uuid, boolean, boolean) owner to postgres;
alter function mapsilip_private.reconcile_first_login(uuid, uuid, uuid) owner to postgres;
alter function public.mapsilip_staff_access_snapshot() owner to postgres;

revoke all on all functions in schema mapsilip_private from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function public.mapsilip_staff_access_snapshot() from public, anon, authenticated, service_role;
grant usage on schema mapsilip_private to authenticated;
grant execute on function mapsilip_private.can_read(text), mapsilip_private.staff_access_snapshot(),
  public.mapsilip_staff_access_snapshot() to authenticated;
grant usage on schema mapsilip_private to mapsilip_security_executor;
grant execute on function mapsilip_private.consume_signin_rate_limit(text, text),
  mapsilip_private.begin_staff_signin(text), mapsilip_private.finish_staff_signin(uuid, uuid, uuid),
  mapsilip_private.begin_first_login_change(uuid, uuid),
  mapsilip_private.has_only_auth_session(uuid, uuid),
  mapsilip_private.revoke_session_admission(uuid, uuid),
  mapsilip_private.complete_first_login(uuid, uuid, uuid, boolean, boolean),
  mapsilip_private.reconcile_first_login(uuid, uuid, uuid) to mapsilip_security_executor;

-- The executor inherits PUBLIC privileges. Abort if any unexpected callable
-- SECURITY DEFINER function is currently reachable through those privileges.
-- Re-run the same catalog check before later code changes that add functions.
do $$
declare unexpected_function text;
begin
  select n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')'
    into unexpected_function
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and p.prokind in ('f', 'p')
    and p.prorettype <> 'pg_catalog.event_trigger'::pg_catalog.regtype
    and n.nspname not in ('pg_catalog', 'information_schema')
    and pg_catalog.has_schema_privilege('mapsilip_security_executor', n.oid, 'USAGE')
    and pg_catalog.has_function_privilege('mapsilip_security_executor', p.oid, 'EXECUTE')
    and not (
      n.nspname = 'mapsilip_private'
      and (p.proname, pg_catalog.oidvectortypes(p.proargtypes)) in (
        ('consume_signin_rate_limit', 'text, text'),
        ('begin_staff_signin', 'text'),
        ('finish_staff_signin', 'uuid, uuid, uuid'),
        ('begin_first_login_change', 'uuid, uuid'),
        ('has_only_auth_session', 'uuid, uuid'),
        ('revoke_session_admission', 'uuid, uuid'),
        ('complete_first_login', 'uuid, uuid, uuid, boolean, boolean'),
        ('reconcile_first_login', 'uuid, uuid, uuid')
      )
    )
  limit 1;
  if unexpected_function is not null then
    raise exception 'Unexpected executable SECURITY DEFINER function is visible to mapsilip_security_executor; inspect the catalog before applying';
  end if;
end;
$$;

-- No account seeds, operational data, Storage buckets, business APIs, or client writes.
commit;
