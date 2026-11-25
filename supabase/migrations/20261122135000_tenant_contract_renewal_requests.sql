begin;

create table mapsilip_private.contract_renewal_requests (
  assignment_id uuid not null references public.room_assignments(id) on delete restrict,
  contract_end_on date not null,
  tenant_id uuid not null references public.tenant_profiles(user_id) on delete restrict,
  requested_at timestamptz not null default now(),
  primary key (assignment_id, contract_end_on)
);
alter table mapsilip_private.contract_renewal_requests enable row level security;
revoke all on mapsilip_private.contract_renewal_requests from public, anon, authenticated, service_role;

create function mapsilip_private.tenant_contract_renewal(p_submit boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  tenant uuid := auth.uid();
  today date := (now() at time zone 'Asia/Manila')::date;
  assignment public.room_assignments%rowtype;
  requested boolean;
begin
  if tenant is null or mapsilip_private.tenant_active() is not true then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into assignment from public.room_assignments
    where tenant_id = tenant and ended_on is null and started_on <= today
      and contract_end_on <= today + 30
    for update;
  if not found then
    if p_submit then raise exception 'renewal request unavailable' using errcode = '22023'; end if;
    return null;
  end if;

  if p_submit then
    insert into mapsilip_private.contract_renewal_requests(assignment_id, contract_end_on, tenant_id)
      values(assignment.id, assignment.contract_end_on, tenant)
      on conflict do nothing;
    if found then
      insert into public.notifications(recipient_id, title, body, href, event_key)
      select owner.user_id, 'Contract renewal requested',
        format('%s requested another contract. The current term ends %s.',
          profile.display_name, to_char(assignment.contract_end_on,'FMMon DD, YYYY')),
        '/management/rooms?tenant=' || tenant,
        'contract-renewal:' || assignment.id || ':' || assignment.contract_end_on || ':' || owner.user_id
      from mapsilip_private.accounts owner cross join public.tenant_profiles profile
      where owner.role = 'owner' and owner.status = 'active' and profile.user_id = tenant
      on conflict (event_key) do nothing;
      insert into public.operational_audit(actor_id, action, record_id)
        values(tenant, 'contract.renewal_requested', assignment.id);
    end if;
  end if;

  select exists(select 1 from mapsilip_private.contract_renewal_requests
    where assignment_id = assignment.id and contract_end_on = assignment.contract_end_on) into requested;
  return jsonb_build_object('assignmentId', assignment.id, 'endOn', assignment.contract_end_on,
    'expired', assignment.contract_end_on < today, 'requested', requested);
end;
$$;

create function public.mapsilip_tenant_contract_renewal(p_submit boolean)
returns jsonb
language sql volatile security invoker set search_path = ''
as $$
  select mapsilip_private.tenant_contract_renewal(p_submit);
$$;

revoke all on function mapsilip_private.tenant_contract_renewal(boolean),
  public.mapsilip_tenant_contract_renewal(boolean) from public, anon, service_role;
grant execute on function mapsilip_private.tenant_contract_renewal(boolean),
  public.mapsilip_tenant_contract_renewal(boolean) to authenticated;

create function mapsilip_private.notify_tenant_contract_expiry()
returns void
language sql security definer set search_path = ''
as $$
  with calendar as (select (now() at time zone 'Asia/Manila')::date as today)
  insert into public.notifications(recipient_id, title, body, href, event_key)
  select a.tenant_id, 'Your contract is ending soon',
    format('Your contract ends %s. Open My Details to request another term.',
      to_char(a.contract_end_on,'FMMon DD, YYYY')),
    '/tenant/details#contract-renewal',
    'tenant-contract-expiry:' || a.id || ':' || a.contract_end_on || ':' ||
      case when a.contract_end_on <= c.today + 7 then 'final-week' else '30-days' end
  from calendar c
  join public.room_assignments a on a.ended_on is null and a.started_on <= c.today
    and a.contract_end_on between c.today and c.today + 30
  join public.tenant_profiles t on t.user_id = a.tenant_id and t.status = 'active'
  where not exists (
    select 1 from mapsilip_private.contract_renewal_requests r
    where r.assignment_id = a.id and r.contract_end_on = a.contract_end_on
  )
  on conflict (event_key) do nothing;
$$;

revoke all on function mapsilip_private.notify_tenant_contract_expiry() from public, anon, authenticated, service_role;
select cron.schedule('mapsilip-tenant-contract-expiry','20 0 * * *','select mapsilip_private.notify_tenant_contract_expiry()');

commit;
