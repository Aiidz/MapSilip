begin;

create function mapsilip_private.audit_tenant_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
declare event_action text;
begin
  if new.tenant_id is null or auth.uid() is distinct from new.tenant_id then
    return new;
  end if;
  event_action := case tg_table_name
    when 'payments' then 'payment.submit'
    when 'maintenance_requests' then 'maintenance.create'
    when 'concerns' then 'concern.create'
    when 'planned_visits' then 'visit.create'
  end;
  insert into public.operational_audit(actor_id, action, record_id)
  values (new.tenant_id, event_action, new.id);
  return new;
end;
$$;
revoke all on function mapsilip_private.audit_tenant_submission() from public, anon, authenticated;

create trigger audit_tenant_payment after insert on public.payments for each row execute function mapsilip_private.audit_tenant_submission();
create trigger audit_tenant_maintenance after insert on public.maintenance_requests for each row execute function mapsilip_private.audit_tenant_submission();
create trigger audit_tenant_concern after insert on public.concerns for each row execute function mapsilip_private.audit_tenant_submission();
create trigger audit_tenant_visit after insert on public.planned_visits for each row execute function mapsilip_private.audit_tenant_submission();

create function public.audit_actor_roles(actor_ids uuid[])
returns table(user_id uuid, role text)
language sql stable security definer set search_path = '' as $$
  select a.user_id, a.role::text from mapsilip_private.accounts a
  where (select mapsilip_private.can_read('tenant.application.approve'))
    and a.user_id = any(actor_ids) and a.role::text in ('owner', 'caretaker');
$$;
revoke all on function public.audit_actor_roles(uuid[]) from public, anon, authenticated;
grant execute on function public.audit_actor_roles(uuid[]) to authenticated;

commit;
