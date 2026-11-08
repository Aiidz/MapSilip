-- Read-only metadata only: never selects Vault secrets, job command text or user records.
select current_database() as database_name, current_user as audit_role, version() as postgres_version;
select a.name, a.default_version as available_version, e.extversion as installed_version,
  e.extname is not null as installed
from pg_available_extensions a left join pg_extension e on e.extname=a.name
where a.name in ('pg_cron','pg_net','supabase_vault') order by a.name;
select nspname as schema_name,
  has_schema_privilege(current_user,oid,'USAGE') as can_use,
  has_schema_privilege(current_user,oid,'CREATE') as can_create
from pg_namespace where nspname in ('cron','net','vault') order by nspname;
select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as argument_types,
  has_function_privilege(current_user,p.oid,'EXECUTE') as can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='cron' and p.proname in ('schedule','unschedule'))
 or (n.nspname='net' and p.proname='http_post')
 or (n.nspname='vault' and p.proname in ('create_secret','update_secret'))
order by n.nspname,p.proname;
-- Actual project plan, quotas and egress policy still require dashboard/official-plan verification.
