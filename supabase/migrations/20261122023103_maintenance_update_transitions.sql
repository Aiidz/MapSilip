begin;

create function mapsilip_private.update_maintenance(p_data jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_role text := mapsilip_private.operational_role();
  request_id uuid := (p_data->>'id')::uuid;
  next_status text := p_data->>'status';
  note text := nullif(btrim(p_data->>'response'), '');
  current_request public.maintenance_requests%rowtype;
begin
  if actor is null or actor_role is null or actor_role not in ('owner', 'caretaker') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if next_status is null or next_status not in ('pending', 'in_progress', 'resolved')
    or char_length(note) > 2000 then
    raise exception 'invalid maintenance update' using errcode = '22023';
  end if;

  select * into current_request from public.maintenance_requests where id = request_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;

  if next_status <> current_request.status and not (
    current_request.status = 'pending'
    or (current_request.status = 'in_progress' and next_status = 'resolved')
  ) then
    raise exception 'invalid transition' using errcode = '23514';
  end if;

  if next_status = current_request.status and note is not distinct from current_request.staff_response then
    return jsonb_build_object('state', 'saved', 'id', request_id);
  end if;

  update public.maintenance_requests
  set status = next_status, staff_response = note, responded_by = actor, updated_at = now()
  where id = request_id;

  if current_request.tenant_id is not null and next_status <> current_request.status then
    insert into public.notifications(recipient_id, title, body, href, event_key)
    values (current_request.tenant_id, 'Maintenance update',
      'Your maintenance request is now ' || replace(next_status, '_', ' ') || '.',
      '/tenant/maintenance', 'maintenance:' || request_id::text || ':' || next_status)
    on conflict (event_key) do nothing;
  end if;
  insert into public.operational_audit(actor_id, action, record_id, reason)
  values (actor, 'maintenance.update', request_id, note);

  return jsonb_build_object('state', 'saved', 'id', request_id);
end;
$$;

revoke all on function mapsilip_private.update_maintenance(jsonb) from public, anon, service_role;
grant execute on function mapsilip_private.update_maintenance(jsonb) to authenticated;

create or replace function public.mapsilip_operate(p_action text, p_data jsonb)
returns jsonb
language sql volatile security invoker set search_path = ''
as $$
  select case when p_action = 'maintenance.update'
    then mapsilip_private.update_maintenance(p_data)
    else mapsilip_private.operate(p_action, p_data)
  end;
$$;

commit;
