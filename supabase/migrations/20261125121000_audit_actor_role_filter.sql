begin;

create function public.audit_events_by_actor_role(actor_role text)
returns setof public.operational_audit
language sql
stable
security definer
set search_path = ''
as $$
  select event.*
  from public.operational_audit as event
  where (select mapsilip_private.can_read('tenant.application.approve'))
    and case
      when actor_role in ('owner', 'caretaker') then exists (
        select 1 from mapsilip_private.accounts as staff
        where staff.user_id = event.actor_id and staff.role::text = actor_role
      )
      when actor_role = 'tenant' then exists (
        select 1 from public.tenant_profiles as tenant
        where tenant.user_id = event.actor_id
      ) and not exists (
        select 1 from mapsilip_private.accounts as staff where staff.user_id = event.actor_id
      )
      else false
    end;
$$;

revoke all on function public.audit_events_by_actor_role(text) from public, anon, authenticated;
grant execute on function public.audit_events_by_actor_role(text) to authenticated;

commit;
