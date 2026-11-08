begin;

-- Public, fixed-result read used only to check that PostgREST can execute a database query.
create function public.mapsilip_project_ping() returns integer
language sql stable security invoker set search_path = '' as $$ select 1; $$;
alter function public.mapsilip_project_ping() owner to postgres;
revoke all on function public.mapsilip_project_ping() from public,anon,authenticated,service_role;
grant execute on function public.mapsilip_project_ping() to anon;

commit;
