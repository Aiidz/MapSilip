begin;

grant select on public.operational_audit to authenticated;

create policy operational_audit_owner_read on public.operational_audit
for select to authenticated
using ((select mapsilip_private.can_read('tenant.application.approve')));

create index operational_audit_latest on public.operational_audit(created_at desc, id desc);

commit;
