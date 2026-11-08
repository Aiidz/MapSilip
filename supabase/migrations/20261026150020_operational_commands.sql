begin;

create function mapsilip_private.submit_account_request(p_email text, p_name text, p_phone text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare r public.account_requests%rowtype;
begin
  p_email := lower(trim(p_email)); p_name := trim(p_name); p_phone := nullif(trim(p_phone), '');
  if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email) > 320
     or length(p_name) not between 1 and 80 or (p_phone is not null and length(p_phone) not between 6 and 30)
     or exists (select 1 from auth.users u where lower(u.email) = p_email and u.deleted_at is null) then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  insert into public.account_requests(email, display_name, phone) values (p_email, p_name, p_phone)
    on conflict do nothing returning * into r;
  if r.id is null then
    select * into r from public.account_requests where email = p_email and status in ('pending','approved','activated');
  end if;
  if r.id is null then raise exception 'request unavailable' using errcode = '23505'; end if;
  insert into public.notifications(recipient_id, title, body, href, event_key)
    select a.user_id, 'Tenant access request', 'A new tenant access request is ready for review.',
      '/management/tenants', 'account-request:' || r.id::text || ':created:' || a.user_id::text
    from mapsilip_private.accounts a where a.role = 'owner' and a.status = 'active'
    on conflict (event_key) do nothing;
  return jsonb_build_object('state','received');
end;
$$;

create function mapsilip_private.review_account_request(p_id uuid, p_decision text, p_invitation_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); r public.account_requests%rowtype;
begin
  if mapsilip_private.operational_role() <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') or (p_decision = 'approved' and coalesce(p_invitation_hash !~ '^[0-9a-f]{64}$',true))
     or (p_decision = 'rejected' and p_invitation_hash is not null) then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  select * into r from public.account_requests where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'already reviewed' using errcode = '23505'; end if;
  update public.account_requests set status = p_decision, reviewer_id = actor, reviewed_at = now(), updated_at = now(),
    invitation_hash = p_invitation_hash, invitation_expires_at = case when p_decision = 'approved' then now() + interval '7 days' else null end
    where id = p_id;
  insert into public.operational_audit(actor_id,action,record_id) values(actor,'account_request.' || p_decision,p_id);
  return jsonb_build_object('state',p_decision);
end;
$$;

create function mapsilip_private.invitation_details(p_id uuid, p_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r public.account_requests%rowtype;
begin
  if p_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into r from public.account_requests where id = p_id and status = 'approved'
    and invitation_hash = p_hash and invitation_expires_at > now();
  if not found then return null; end if;
  return jsonb_build_object('email',r.email,'display_name',r.display_name);
end;
$$;

create function mapsilip_private.claim_account(p_id uuid, p_hash text)
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
  insert into public.tenant_profiles(user_id,display_name,phone,status)
    values (uid,r.display_name,r.phone,'active') on conflict (user_id) do nothing;
  if not exists (select 1 from public.tenant_profiles p where p.user_id = uid and p.status = 'active') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.account_requests set status = 'activated', activated_user_id = uid, updated_at = now() where id = p_id;
  insert into public.notifications(recipient_id,title,body,href,event_key)
    values(uid,'Account ready','Your tenant account is active.','/tenant','account-request:' || p_id::text || ':activated')
    on conflict (event_key) do nothing;
  insert into public.operational_audit(actor_id,action,record_id) values(uid,'account_request.activated',p_id);
  return jsonb_build_object('state','activated');
end;
$$;

create function mapsilip_private.operate(p_action text, p_data jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_role text; rec_id uuid; target uuid; room_rec public.rooms%rowtype;
  request_rec public.maintenance_requests%rowtype; concern_rec public.concerns%rowtype;
  payment_rec public.payments%rowtype; invoice_rec public.invoices%rowtype;
  attachment_rec public.attachments%rowtype; current_assignment public.room_assignments%rowtype;
  status_text text; note_text text; requested_key uuid;
begin
  actor_role := mapsilip_private.operational_role();
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid input' using errcode = '22023'; end if;
  if p_action = 'notification.read' then
    rec_id := (p_data->>'id')::uuid;
    update public.notifications set read_at = coalesce(read_at,now()) where id = rec_id and recipient_id = actor;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    return jsonb_build_object('state','read');
  elsif p_action = 'profile.update' then
    if actor_role = 'tenant' then
      update public.tenant_profiles set display_name = trim(p_data->>'display_name'),
        phone = nullif(trim(p_data->>'phone'),''), emergency_contact = nullif(trim(p_data->>'emergency_contact'),''), updated_at = now()
        where user_id = actor;
    else
      insert into public.staff_profiles(user_id,display_name,phone) values
        (actor,nullif(trim(p_data->>'display_name'),''),nullif(trim(p_data->>'phone'),''))
        on conflict (user_id) do update set display_name = excluded.display_name, phone = excluded.phone, updated_at = now();
    end if;
    return jsonb_build_object('state','saved');
  elsif p_action = 'attachment.begin' then
    if p_data->>'purpose' not in ('payment','maintenance','profile') or (actor_role <> 'tenant' and p_data->>'purpose' = 'payment') then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    rec_id := gen_random_uuid();
    insert into public.attachments(id,uploader_id,purpose,path,mime_type,byte_size)
      values(rec_id,actor,p_data->>'purpose',actor::text || '/' || rec_id::text,p_data->>'mime_type',(p_data->>'byte_size')::integer);
    return jsonb_build_object('id',rec_id,'path',actor::text || '/' || rec_id::text);
  elsif p_action = 'room.create' then
    if actor_role <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
    insert into public.rooms(room_number,floor_label,capacity)
      values(trim(p_data->>'room_number'),trim(p_data->>'floor_label'),(p_data->>'capacity')::integer) returning id into rec_id;
    insert into public.operational_audit(actor_id,action,record_id) values(actor,p_action,rec_id);
  elsif p_action = 'room.update' then
    if actor_role <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
    rec_id := (p_data->>'id')::uuid;
    select * into room_rec from public.rooms where id = rec_id for update;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    if (p_data->>'capacity')::integer < (select count(*) from public.room_assignments where room_id = rec_id and ended_on is null)
       or ((p_data->>'availability') <> 'available' and exists (select 1 from public.room_assignments where room_id = rec_id and ended_on is null)) then
      raise exception 'room has occupants' using errcode = '23514';
    end if;
    update public.rooms set room_number = trim(p_data->>'room_number'), floor_label = trim(p_data->>'floor_label'),
      capacity = (p_data->>'capacity')::integer, availability = p_data->>'availability', updated_at = now() where id = rec_id;
    insert into public.operational_audit(actor_id,action,record_id) values(actor,p_action,rec_id);
  elsif p_action = 'room.assign' then
    if actor_role <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
    target := (p_data->>'tenant_id')::uuid;
    perform 1 from public.tenant_profiles where user_id = target and status = 'active' for update;
    if not found then raise exception 'tenant unavailable' using errcode = 'P0002'; end if;
    rec_id := (p_data->>'room_id')::uuid;
    select * into room_rec from public.rooms where id = rec_id for update;
    if not found or room_rec.availability <> 'available' then raise exception 'room unavailable' using errcode = '23514'; end if;
    if (select count(*) from public.room_assignments where room_id = rec_id and ended_on is null) >= room_rec.capacity then
      raise exception 'room full' using errcode = '23514';
    end if;
    select * into current_assignment from public.room_assignments where tenant_id = target and ended_on is null for update;
    if found then
      if current_assignment.room_id = rec_id then raise exception 'already assigned' using errcode = '23505'; end if;
      if (p_data->>'started_on')::date <= current_assignment.started_on then raise exception 'invalid date' using errcode = '22023'; end if;
      update public.room_assignments set ended_on = (p_data->>'started_on')::date - 1 where id = current_assignment.id;
    end if;
    insert into public.room_assignments(tenant_id,room_id,started_on,created_by)
      values(target,rec_id,(p_data->>'started_on')::date,actor) returning id into rec_id;
    insert into public.maintenance_requests(request_key,room_id,category,description)
      values(gen_random_uuid(),room_rec.id,'Room Prep','Prepare the room and keys for the incoming resident.');
    insert into public.notifications(recipient_id,title,body,href,event_key)
      values(target,'Room assignment','Your room assignment has been updated.','/tenant/details','assignment:' || rec_id::text)
      on conflict (event_key) do nothing;
    insert into public.notifications(recipient_id,title,body,href,event_key)
      select a.user_id,'Room preparation','A room is ready for preparation.','/caretaker/maintenance','room-prep:' || rec_id::text || ':' || a.user_id::text
      from mapsilip_private.accounts a where a.role = 'caretaker' and a.status = 'active'
      on conflict (event_key) do nothing;
    insert into public.operational_audit(actor_id,action,record_id) values(actor,p_action,rec_id);
  elsif p_action = 'invoice.create' then
    if actor_role <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
    target := (p_data->>'tenant_id')::uuid;
    select * into current_assignment from public.room_assignments where tenant_id = target and ended_on is null;
    if not found then raise exception 'tenant has no room' using errcode = '23514'; end if;
    insert into public.invoices(tenant_id,room_id,coverage_start,coverage_end,due_on,amount,currency,note,created_by)
      values(target,current_assignment.room_id,(p_data->>'coverage_start')::date,(p_data->>'coverage_end')::date,
      (p_data->>'due_on')::date,(p_data->>'amount')::numeric,p_data->>'currency',p_data->>'note',actor)
      returning id into rec_id;
    insert into public.notifications(recipient_id,title,body,href,event_key)
      values(target,'Invoice available','A new rent invoice is available.','/tenant/payments','invoice:' || rec_id::text)
      on conflict (event_key) do nothing;
    insert into public.operational_audit(actor_id,action,record_id) values(actor,p_action,rec_id);
  elsif p_action = 'payment.submit' then
    if actor_role <> 'tenant' then raise exception 'not authorized' using errcode = '42501'; end if;
    requested_key := (p_data->>'request_key')::uuid;
    select * into invoice_rec from public.invoices where id = (p_data->>'invoice_id')::uuid and tenant_id = actor;
    if not found then raise exception 'invoice unavailable' using errcode = '42501'; end if;
    select * into attachment_rec from public.attachments where id = (p_data->>'attachment_id')::uuid and uploader_id = actor
      and purpose = 'payment';
    if not found or not exists (select 1 from storage.objects o where o.bucket_id = 'mapsilip_evidence' and o.name = attachment_rec.path) then
      raise exception 'proof unavailable' using errcode = '23514';
    end if;
    insert into public.payments(request_key,invoice_id,tenant_id,amount,method,reference_number,attachment_id)
      values(requested_key,invoice_rec.id,actor,(p_data->>'amount')::numeric,p_data->>'method',trim(p_data->>'reference_number'),attachment_rec.id)
      on conflict (request_key) do nothing returning id into rec_id;
    if rec_id is null then select id into rec_id from public.payments where request_key = requested_key and tenant_id = actor; end if;
    if rec_id is null then raise exception 'duplicate request' using errcode = '23505'; end if;
    insert into public.notifications(recipient_id,title,body,href,event_key)
      select a.user_id,'Payment proof submitted','A payment proof is ready for review.','/management/payments',
        'payment:' || rec_id::text || ':submitted:' || a.user_id::text
      from mapsilip_private.accounts a where a.role = 'owner' and a.status = 'active'
      on conflict (event_key) do nothing;
  elsif p_action = 'payment.review' then
    if actor_role <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
    rec_id := (p_data->>'id')::uuid; status_text := p_data->>'status'; note_text := nullif(trim(p_data->>'note'),'');
    if status_text not in ('approved','rejected') or (status_text = 'rejected' and note_text is null) then
      raise exception 'invalid review' using errcode = '22023'; end if;
    select * into payment_rec from public.payments where id = rec_id for update;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    if payment_rec.status <> 'pending' then raise exception 'already reviewed' using errcode = '23505'; end if;
    update public.payments set status = status_text, review_note = note_text, reviewer_id = actor, reviewed_at = now() where id = rec_id;
    insert into public.notifications(recipient_id,title,body,href,event_key)
      values(payment_rec.tenant_id,'Payment reviewed','Your payment proof was ' || status_text || '.',
        '/tenant/payments','payment:' || rec_id::text || ':' || status_text)
      on conflict (event_key) do nothing;
    insert into public.operational_audit(actor_id,action,record_id,reason) values(actor,p_action,rec_id,note_text);
  elsif p_action = 'maintenance.create' then
    if actor_role <> 'tenant' then raise exception 'not authorized' using errcode = '42501'; end if;
    requested_key := (p_data->>'request_key')::uuid;
    select * into current_assignment from public.room_assignments where tenant_id = actor and ended_on is null;
    if not found then raise exception 'room unavailable' using errcode = '23514'; end if;
    if p_data ? 'attachment_id' and p_data->>'attachment_id' is not null then
      select * into attachment_rec from public.attachments where id = (p_data->>'attachment_id')::uuid
        and uploader_id = actor and purpose = 'maintenance';
      if not found or not exists (select 1 from storage.objects o where o.bucket_id = 'mapsilip_evidence' and o.name = attachment_rec.path) then
        raise exception 'photo unavailable' using errcode = '23514'; end if;
    else attachment_rec.id := null; end if;
    insert into public.maintenance_requests(request_key,tenant_id,room_id,category,description,attachment_id)
      values(requested_key,actor,current_assignment.room_id,trim(p_data->>'category'),trim(p_data->>'description'),attachment_rec.id)
      on conflict (request_key) do nothing returning id into rec_id;
    if rec_id is null then select id into rec_id from public.maintenance_requests where request_key = requested_key and tenant_id = actor; end if;
    if rec_id is null then raise exception 'duplicate request' using errcode = '23505'; end if;
    insert into public.notifications(recipient_id,title,body,href,event_key)
      select a.user_id,'Maintenance request','A new maintenance request is ready.','/management/maintenance',
        'maintenance:' || rec_id::text || ':submitted:' || a.user_id::text
      from mapsilip_private.accounts a where a.role = 'owner' and a.status = 'active'
      on conflict (event_key) do nothing;
    insert into public.notifications(recipient_id,title,body,href,event_key)
      select a.user_id,'Maintenance request','A new maintenance request is ready.','/caretaker/maintenance',
        'maintenance:' || rec_id::text || ':submitted:' || a.user_id::text
      from mapsilip_private.accounts a where a.role = 'caretaker' and a.status = 'active'
      on conflict (event_key) do nothing;
  elsif p_action = 'maintenance.update' then
    if actor_role not in ('owner','caretaker') then raise exception 'not authorized' using errcode = '42501'; end if;
    rec_id := (p_data->>'id')::uuid; status_text := p_data->>'status'; note_text := nullif(trim(p_data->>'response'),'');
    select * into request_rec from public.maintenance_requests where id = rec_id for update;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    if not ((request_rec.status = 'pending' and status_text = 'in_progress') or
            (request_rec.status = 'in_progress' and status_text = 'resolved')) then
      raise exception 'invalid transition' using errcode = '23514'; end if;
    update public.maintenance_requests set status = status_text, staff_response = note_text,
      responded_by = actor, updated_at = now() where id = rec_id;
    if request_rec.tenant_id is not null then
      insert into public.notifications(recipient_id,title,body,href,event_key)
        values(request_rec.tenant_id,'Maintenance update','Your maintenance request is now ' || replace(status_text,'_',' ') || '.',
          '/tenant/maintenance','maintenance:' || rec_id::text || ':' || status_text)
        on conflict (event_key) do nothing;
    end if;
    insert into public.operational_audit(actor_id,action,record_id,reason) values(actor,p_action,rec_id,note_text);
  elsif p_action = 'concern.create' then
    if actor_role <> 'tenant' then raise exception 'not authorized' using errcode = '42501'; end if;
    requested_key := (p_data->>'request_key')::uuid;
    insert into public.concerns(request_key,tenant_id,description) values(requested_key,actor,trim(p_data->>'description'))
      on conflict (request_key) do nothing returning id into rec_id;
    if rec_id is null then select id into rec_id from public.concerns where request_key = requested_key and tenant_id = actor; end if;
    if rec_id is null then raise exception 'duplicate request' using errcode = '23505'; end if;
    insert into public.notifications(recipient_id,title,body,href,event_key)
      select a.user_id,'Tenant concern','A tenant concern is ready for review.','/management/tenants',
        'concern:' || rec_id::text || ':submitted:' || a.user_id::text
      from mapsilip_private.accounts a where a.role = 'owner' and a.status = 'active'
      on conflict (event_key) do nothing;
  elsif p_action = 'concern.respond' then
    if actor_role <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
    rec_id := (p_data->>'id')::uuid; note_text := nullif(trim(p_data->>'response'),'');
    if note_text is null then raise exception 'response required' using errcode = '22023'; end if;
    select * into concern_rec from public.concerns where id = rec_id for update;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
    if concern_rec.status <> 'pending' then raise exception 'already resolved' using errcode = '23505'; end if;
    update public.concerns set status = 'resolved',owner_response = note_text,responded_by = actor,updated_at = now() where id = rec_id;
    insert into public.notifications(recipient_id,title,body,href,event_key)
      values(concern_rec.tenant_id,'Concern answered','The dormitory team responded to your concern.','/tenant/concerns',
        'concern:' || rec_id::text || ':resolved') on conflict (event_key) do nothing;
    insert into public.operational_audit(actor_id,action,record_id) values(actor,p_action,rec_id);
  elsif p_action = 'visit.create' then
    if actor_role <> 'tenant' then raise exception 'not authorized' using errcode = '42501'; end if;
    requested_key := (p_data->>'request_key')::uuid;
    insert into public.planned_visits(request_key,tenant_id,visitor_name,visit_on,purpose)
      values(requested_key,actor,trim(p_data->>'visitor_name'),(p_data->>'visit_on')::date,trim(p_data->>'purpose'))
      on conflict (request_key) do nothing returning id into rec_id;
    if rec_id is null then select id into rec_id from public.planned_visits where request_key = requested_key and tenant_id = actor; end if;
    if rec_id is null then raise exception 'duplicate request' using errcode = '23505'; end if;
  elsif p_action = 'visit.cancel' then
    if actor_role <> 'tenant' then raise exception 'not authorized' using errcode = '42501'; end if;
    rec_id := (p_data->>'id')::uuid;
    update public.planned_visits set cancelled_at = now() where id = rec_id and tenant_id = actor and cancelled_at is null;
    if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  else
    raise exception 'unsupported action' using errcode = '42501';
  end if;
  return jsonb_build_object('state','saved','id',rec_id);
end;
$$;

create function public.mapsilip_operate(p_action text, p_data jsonb) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select mapsilip_private.operate(p_action,p_data);
$$;
create function public.mapsilip_review_account_request(p_id uuid,p_decision text,p_invitation_hash text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select mapsilip_private.review_account_request(p_id,p_decision,p_invitation_hash);
$$;
create function public.mapsilip_invitation_details(p_id uuid,p_hash text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select mapsilip_private.invitation_details(p_id,p_hash);
$$;
create function public.mapsilip_claim_account(p_id uuid,p_hash text) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select mapsilip_private.claim_account(p_id,p_hash);
$$;

alter function mapsilip_private.submit_account_request(text,text,text) owner to postgres;
alter function mapsilip_private.review_account_request(uuid,text,text) owner to postgres;
alter function mapsilip_private.invitation_details(uuid,text) owner to postgres;
alter function mapsilip_private.claim_account(uuid,text) owner to postgres;
alter function mapsilip_private.operate(text,jsonb) owner to postgres;
alter function public.mapsilip_operate(text,jsonb) owner to postgres;
alter function public.mapsilip_review_account_request(uuid,text,text) owner to postgres;
alter function public.mapsilip_invitation_details(uuid,text) owner to postgres;
alter function public.mapsilip_claim_account(uuid,text) owner to postgres;

revoke all on function mapsilip_private.submit_account_request(text,text,text),
  mapsilip_private.review_account_request(uuid,text,text), mapsilip_private.invitation_details(uuid,text),
  mapsilip_private.claim_account(uuid,text), mapsilip_private.operate(text,jsonb) from public,anon,authenticated,service_role,mapsilip_security_executor;
revoke all on function public.mapsilip_operate(text,jsonb), public.mapsilip_review_account_request(uuid,text,text),
  public.mapsilip_invitation_details(uuid,text), public.mapsilip_claim_account(uuid,text) from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.submit_account_request(text,text,text) to mapsilip_security_executor;
grant execute on function mapsilip_private.invitation_details(uuid,text) to mapsilip_security_executor;
grant execute on function mapsilip_private.review_account_request(uuid,text,text), mapsilip_private.invitation_details(uuid,text),
  mapsilip_private.claim_account(uuid,text), mapsilip_private.operate(text,jsonb) to authenticated;
grant execute on function public.mapsilip_operate(text,jsonb), public.mapsilip_review_account_request(uuid,text,text),
  public.mapsilip_invitation_details(uuid,text), public.mapsilip_claim_account(uuid,text) to authenticated;

commit;
