begin;

-- Owner directory: sort before paging so unassigned tenants are never hidden on a later page.
create function mapsilip_private.tenant_directory(
  p_page integer, p_page_size integer, p_search text, p_status text
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not mapsilip_private.can_read('tenant.application.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_page is null or p_page < 1 or p_page > 10000 or
     p_page_size is null or p_page_size < 1 or p_page_size > 100 or
     p_search is null or pg_catalog.length(p_search) > 80 or
     pg_catalog.strpos(p_search, '%') > 0 or
     pg_catalog.strpos(p_search, '_') > 0 or
     pg_catalog.strpos(p_search, pg_catalog.chr(92)) > 0 or
     p_status is null or p_status not in ('', 'active', 'inactive') then
    raise exception 'invalid directory filter' using errcode = '22023';
  end if;

  with matching as (
    select p.user_id, p.display_name, p.phone, p.emergency_contact, p.status,
      u.email, current_assignment.room_id, current_assignment.started_on,
      r.room_number, r.floor_label,
      case when current_assignment.room_id is null then 0 else 1 end as assignment_rank
    from public.tenant_profiles p
    join auth.users u on u.id = p.user_id
    left join lateral (
      select a.room_id, a.started_on from public.room_assignments a
      where a.tenant_id = p.user_id and a.ended_on is null
      order by a.started_on desc limit 1
    ) current_assignment on true
    left join public.rooms r on r.id = current_assignment.room_id
    where (p_status = '' or p.status = p_status)
      and (p_search = '' or p.display_name ilike '%' || p_search || '%'
        or u.email ilike '%' || p_search || '%'
        or r.room_number ilike '%' || p_search || '%')
  ), page_rows as (
    select * from matching
    order by assignment_rank, pg_catalog.lower(display_name), user_id
    offset (p_page - 1) * p_page_size limit p_page_size
  )
  select pg_catalog.jsonb_build_object(
    'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item)
      order by item.assignment_rank, pg_catalog.lower(item.display_name), item.user_id)
      from page_rows item), '[]'::jsonb),
    'count', (select count(*) from matching)
  ) into result;
  return result;
end;
$$;

create function mapsilip_private.deactivate_tenant(p_tenant_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  target_profile public.tenant_profiles%rowtype;
  assignment_count integer;
  was_active boolean;
  today_local date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
begin
  if not mapsilip_private.can_read('tenant.application.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select p.* into target_profile from public.tenant_profiles p
    where p.user_id = p_tenant_id for update;
  if not found then raise exception 'tenant not found' using errcode = 'P0002'; end if;
  was_active := target_profile.status = 'active';
  update public.tenant_profiles set status = 'inactive', updated_at = pg_catalog.now()
    where user_id = p_tenant_id and status = 'active';
  update public.room_assignments set ended_on = greatest(started_on, today_local)
    where tenant_id = p_tenant_id and ended_on is null;
  get diagnostics assignment_count = row_count;
  if was_active or assignment_count > 0 then
    insert into public.operational_audit(actor_id, action, record_id)
      values(auth.uid(), 'tenant.deactivate', p_tenant_id);
  end if;
  return pg_catalog.jsonb_build_object('state', 'deactivated');
end;
$$;

create function public.mapsilip_tenant_directory(
  p_page integer, p_page_size integer, p_search text, p_status text
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select mapsilip_private.tenant_directory(p_page, p_page_size, p_search, p_status);
$$;
create function public.mapsilip_deactivate_tenant(p_tenant_id uuid) returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select mapsilip_private.deactivate_tenant(p_tenant_id);
$$;

alter function mapsilip_private.tenant_directory(integer,integer,text,text) owner to postgres;
alter function mapsilip_private.deactivate_tenant(uuid) owner to postgres;
alter function public.mapsilip_tenant_directory(integer,integer,text,text) owner to postgres;
alter function public.mapsilip_deactivate_tenant(uuid) owner to postgres;
revoke all on function mapsilip_private.tenant_directory(integer,integer,text,text),
  mapsilip_private.deactivate_tenant(uuid) from public, anon, authenticated, service_role, mapsilip_security_executor;
revoke all on function public.mapsilip_tenant_directory(integer,integer,text,text),
  public.mapsilip_deactivate_tenant(uuid) from public, anon, authenticated, service_role;
grant execute on function mapsilip_private.tenant_directory(integer,integer,text,text),
  mapsilip_private.deactivate_tenant(uuid) to authenticated;
grant execute on function public.mapsilip_tenant_directory(integer,integer,text,text),
  public.mapsilip_deactivate_tenant(uuid) to authenticated;

commit;
