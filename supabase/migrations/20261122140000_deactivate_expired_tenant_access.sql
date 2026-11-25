begin;

create function mapsilip_private.deactivate_expired_tenant_access()
returns void
language sql volatile security definer set search_path = ''
as $$
  with expired as (
    update public.tenant_profiles p
    set status = 'inactive', updated_at = now()
    where p.status = 'active'
      and exists (
        select 1 from public.room_assignments a
        where a.tenant_id = p.user_id and a.ended_on is null
          and a.contract_end_on < (now() at time zone 'Asia/Manila')::date
      )
    returning p.user_id
  )
  insert into public.operational_audit(actor_id, action, record_id, reason)
  select null, 'tenant.contract_expired', user_id, 'Contract ended. Room assignment retained for checkout.'
  from expired;
$$;

revoke all on function mapsilip_private.deactivate_expired_tenant_access()
from public, anon, authenticated, service_role;

-- Run just after midnight Manila time. A retry only touches still-active profiles.
select cron.schedule('mapsilip-tenant-contract-deactivation','5 16 * * *',
  'select mapsilip_private.deactivate_expired_tenant_access()');

commit;
