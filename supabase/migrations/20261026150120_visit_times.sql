begin;

alter table public.planned_visits add column arrival_time time, add column departure_time time;
alter table public.planned_visits add constraint planned_visits_time_order
  check (arrival_time is null or departure_time is null or departure_time > arrival_time);

create function mapsilip_private.create_visit(p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); rec_id uuid; request_id uuid;
begin
  if mapsilip_private.operational_role() <> 'tenant' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid input' using errcode = '22023'; end if;
  request_id := (p_data->>'request_key')::uuid;
  insert into public.planned_visits(request_key,tenant_id,visitor_name,visit_on,purpose,arrival_time,departure_time)
    values(request_id,actor,trim(p_data->>'visitor_name'),(p_data->>'visit_on')::date,trim(p_data->>'purpose'),
      (p_data->>'arrival_time')::time,(p_data->>'departure_time')::time)
    on conflict (request_key) do nothing returning id into rec_id;
  if rec_id is null then select id into rec_id from public.planned_visits where request_key=request_id and tenant_id=actor; end if;
  if rec_id is null then raise exception 'duplicate request' using errcode = '23505'; end if;
  return jsonb_build_object('state','saved','id',rec_id);
end;
$$;
create function public.mapsilip_create_visit(p_data jsonb) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select mapsilip_private.create_visit(p_data); $$;
alter function mapsilip_private.create_visit(jsonb) owner to postgres;
alter function public.mapsilip_create_visit(jsonb) owner to postgres;
revoke all on function mapsilip_private.create_visit(jsonb), public.mapsilip_create_visit(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.create_visit(jsonb), public.mapsilip_create_visit(jsonb) to authenticated;

commit;
