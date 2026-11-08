-- REVIEW-ONLY HOSTED RLS TEST FIXTURES. This is deliberately NOT a migration.
-- Applying it creates two public marker tables, fixed synthetic rows and
-- SELECT policies. Storage fixtures are a separate optional SQL batch.
-- Never run against production data, and never use these tables for operations.
-- Recheck every object/policy/bucket name immediately before applying; abort on
-- any collision. The test objects have no tenant, payment, or personal data.
begin;

do $$
begin
  if to_regclass('public.mapsilip_staff_security_probe') is not null
    or to_regclass('public.mapsilip_financial_security_probe') is not null then
    raise exception 'MapSilip security probe name collision; inspect before proceeding';
  end if;
end;
$$;

create table public.mapsilip_staff_security_probe (
  id uuid primary key,
  marker text not null check (marker = 'synthetic-staff-probe')
);
create table public.mapsilip_financial_security_probe (
  id uuid primary key,
  marker text not null check (marker = 'synthetic-finance-probe')
);
insert into public.mapsilip_staff_security_probe values
  ('90000000-0000-4000-8000-000000000001','synthetic-staff-probe');
insert into public.mapsilip_financial_security_probe values
  ('90000000-0000-4000-8000-000000000002','synthetic-finance-probe');

alter table public.mapsilip_staff_security_probe enable row level security;
alter table public.mapsilip_financial_security_probe enable row level security;
revoke all on public.mapsilip_staff_security_probe, public.mapsilip_financial_security_probe
  from public, anon, authenticated, service_role, mapsilip_security_executor;
grant select on public.mapsilip_staff_security_probe, public.mapsilip_financial_security_probe to authenticated;
create policy mapsilip_staff_probe_read on public.mapsilip_staff_security_probe
  for select to authenticated using ((select mapsilip_private.can_read('staff.access.inspect')));
create policy mapsilip_financial_probe_read on public.mapsilip_financial_security_probe
  for select to authenticated using ((select mapsilip_private.can_read('finance.read')));
commit;
