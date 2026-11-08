begin;

create index if not exists maintenance_requests_room_created
  on public.maintenance_requests(room_id, created_at desc);

create function mapsilip_private.room_context(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_role text;
  room_row public.rooms%rowtype;
  residents jsonb := '[]'::jsonb;
  visits jsonb := '[]'::jsonb;
  maintenance jsonb := '[]'::jsonb;
  local_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
begin
  if mapsilip_private.can_read('tenant.application.approve') then
    viewer_role := 'owner';
  elsif mapsilip_private.can_read('staff.access.inspect') then
    viewer_role := 'caretaker';
  end if;
  if viewer_role not in ('owner', 'caretaker') or viewer_role is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select r.* into room_row from public.rooms r where r.id = p_room_id;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;

  if viewer_role = 'owner' then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', p.user_id, 'display_name', p.display_name, 'phone', p.phone,
      'email', u.email, 'emergency_contact', p.emergency_contact, 'status', p.status
    ) order by p.display_name, p.user_id), '[]'::jsonb)
      into residents
    from public.room_assignments a
    join public.tenant_profiles p on p.user_id = a.tenant_id
    join auth.users u on u.id = p.user_id
    where a.room_id = p_room_id and a.ended_on is null;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) order by v.visit_on, v.arrival_time), '[]'::jsonb)
      into visits from (
        select v.id, v.visitor_name, v.visit_on, v.arrival_time, v.departure_time,
          v.purpose, v.cancelled_at, p.display_name as resident_name
        from public.planned_visits v
        join public.room_assignments a on a.tenant_id = v.tenant_id
          and a.room_id = p_room_id and v.visit_on >= a.started_on
          and (a.ended_on is null or v.visit_on <= a.ended_on)
        join public.tenant_profiles p on p.user_id = v.tenant_id
        order by v.visit_on desc, v.id desc limit 100
      ) v;
  else
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', p.user_id, 'display_name', p.display_name, 'phone', p.phone, 'status', p.status
    ) order by p.display_name, p.user_id), '[]'::jsonb)
      into residents
    from public.room_assignments a
    join public.tenant_profiles p on p.user_id = a.tenant_id
    where a.room_id = p_room_id and a.ended_on is null;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) order by v.visit_on, v.arrival_time), '[]'::jsonb)
      into visits from (
        select v.id, v.visitor_name, v.visit_on, v.arrival_time, v.departure_time,
          null::timestamptz as cancelled_at, p.display_name as resident_name
        from public.planned_visits v
        join public.room_assignments a on a.tenant_id = v.tenant_id
          and a.room_id = p_room_id and a.ended_on is null
        join public.tenant_profiles p on p.user_id = v.tenant_id
        where v.cancelled_at is null and v.visit_on >= local_today
        order by v.visit_on, v.id limit 50
      ) v;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.created_at desc), '[]'::jsonb)
    into maintenance from (
      select m.id, m.category, m.description, m.status, m.staff_response,
        m.attachment_id, m.created_at, m.updated_at
      from public.maintenance_requests m
      where m.room_id = p_room_id
      order by m.created_at desc, m.id desc limit 100
    ) m;

  return pg_catalog.jsonb_build_object(
    'viewer_role', viewer_role,
    'room', pg_catalog.jsonb_build_object(
      'id', room_row.id, 'room_number', room_row.room_number,
      'floor_label', room_row.floor_label, 'capacity', room_row.capacity,
      'availability', room_row.availability),
    'residents', residents, 'visits', visits, 'maintenance', maintenance);
end;
$$;

create function public.mapsilip_room_context(p_room_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select mapsilip_private.room_context(p_room_id);
$$;

alter function mapsilip_private.room_context(uuid) owner to postgres;
alter function public.mapsilip_room_context(uuid) owner to postgres;
revoke all on function mapsilip_private.room_context(uuid)
  from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function public.mapsilip_room_context(uuid)
  from public, anon, authenticated, service_role;
grant execute on function mapsilip_private.room_context(uuid) to authenticated;
grant execute on function public.mapsilip_room_context(uuid) to authenticated;

commit;
