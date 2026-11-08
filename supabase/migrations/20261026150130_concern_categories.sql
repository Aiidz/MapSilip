begin;

alter table public.concerns add column category text not null default 'General'
  check (length(category) between 2 and 80);

create function mapsilip_private.create_concern(p_data jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); rec_id uuid; request_id uuid;
begin
  if mapsilip_private.operational_role() <> 'tenant' then raise exception 'not authorized' using errcode='42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'invalid input' using errcode='22023'; end if;
  request_id := (p_data->>'request_key')::uuid;
  insert into public.concerns(request_key,tenant_id,category,description)
    values(request_id,actor,trim(p_data->>'category'),trim(p_data->>'description'))
    on conflict (request_key) do nothing returning id into rec_id;
  if rec_id is null then select id into rec_id from public.concerns where request_key=request_id and tenant_id=actor; end if;
  if rec_id is null then raise exception 'duplicate request' using errcode='23505'; end if;
  insert into public.notifications(recipient_id,title,body,href,event_key)
    select a.user_id,'Tenant concern','A tenant concern is ready for review.','/management/tenants',
      'concern:' || rec_id::text || ':submitted:' || a.user_id::text
    from mapsilip_private.accounts a where a.role='owner' and a.status='active'
    on conflict (event_key) do nothing;
  return jsonb_build_object('state','saved','id',rec_id);
end;
$$;
create function public.mapsilip_create_concern(p_data jsonb) returns jsonb
language sql volatile security invoker set search_path = '' as $$ select mapsilip_private.create_concern(p_data); $$;
alter function mapsilip_private.create_concern(jsonb) owner to postgres;
alter function public.mapsilip_create_concern(jsonb) owner to postgres;
revoke all on function mapsilip_private.create_concern(jsonb),public.mapsilip_create_concern(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.create_concern(jsonb),public.mapsilip_create_concern(jsonb) to authenticated;

commit;
