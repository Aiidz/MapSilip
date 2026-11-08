-- Run in the intended project's SQL Editor with authorized administration access.
-- Read-only inspection: no migrations, grants, account changes, or data writes.
begin read only;

with expected(version, name) as (values
  ('20261025081017', 'staff_authorization'),
  ('20261025081034', 'staff_security_probes'),
  ('20261026123837', 'tenant_profiles'),
  ('20261026150000', 'operational_core'),
  ('20261026150010', 'operational_access'),
  ('20261026150020', 'operational_commands'),
  ('20261026150030', 'operational_dashboard'),
  ('20261026150040', 'project_ping'),
  ('20261026150050', 'tenant_role_exclusivity'),
  ('20261026150060', 'visit_notifications'),
  ('20261026150070', 'payment_retry'),
  ('20261026150080', 'invitation_renewal'),
  ('20261026150090', 'currency_safe_dashboard'),
  ('20261026150100', 'payment_status_summary'),
  ('20261026150110', 'payment_monthly_summary'),
  ('20261026150120', 'visit_times'),
  ('20261026150130', 'concern_categories'),
  ('20261027120000', 'tenant_approval_and_room_assignment'),
  ('20261029120000', 'room_context'),
  ('20261029130000', 'tenant_directory'),
  ('20261029150716', 'storage_authenticated_reads')
)
select coalesce(e.version, h.version) as version,
  e.name as repository_name, h.name as hosted_name,
  case when e.version is null then 'HOSTED_ONLY'
       when h.version is null then 'MISSING_HOSTED'
       when e.name is distinct from h.name then 'NAME_DIFFERS'
       else 'MATCH' end as status
from expected e
full join supabase_migrations.schema_migrations h on h.version = e.version
order by coalesce(e.version, h.version);

-- No tenant data or credentials are returned by these metadata queries.
select n.nspname as schema_name, c.relname as table_name,
  c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'mapsilip_private', 'storage')
  and c.relkind = 'r'
order by n.nspname, c.relname;

select a.role, a.status, a.password_change_required,
  count(*) as existing_synthetic_accounts
from mapsilip_private.accounts a
join auth.users u on u.id = a.user_id
where lower(u.email) like '%.invalid'
group by a.role, a.status, a.password_change_required
order by a.role, a.status;

select p.status, count(*) as existing_synthetic_tenants,
  count(*) filter (where exists (
    select 1 from public.room_assignments ra
    where ra.tenant_id = p.user_id and ra.ended_on is null
  )) as tenants_with_room_assignment
from public.tenant_profiles p
join auth.users u on u.id = p.user_id
where lower(u.email) like '%.invalid'
group by p.status;

rollback;
