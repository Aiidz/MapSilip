begin;

create function mapsilip_private.notify_owner_contract_expiry()
returns void
language sql security definer set search_path = ''
as $$
  with calendar as (
    select (now() at time zone 'Asia/Manila')::date as today,
           (date_trunc('month', now() at time zone 'Asia/Manila') + interval '1 month')::date as next_month,
           (date_trunc('month', now() at time zone 'Asia/Manila') + interval '2 months')::date as month_after_next
  )
  insert into public.notifications(recipient_id,title,body,href,event_key)
  select owner.user_id,
         case when a.contract_end_on < c.next_month then 'Contract ending this month'
              else 'Contract ending next month' end,
         format('%s · %s · Contract ends %s', t.display_name,
           case when r.room_number ~* '^room[[:space:]]' then r.room_number else 'Room ' || r.room_number end,
           to_char(a.contract_end_on,'FMMon DD, YYYY')),
         '/management/rooms?tenant=' || a.tenant_id,
         'contract-expiry:' || a.id || ':' || a.contract_end_on || ':' ||
           case when a.contract_end_on < c.next_month then 'current:' else 'next:' end || owner.user_id
  from calendar c
  join public.room_assignments a on a.ended_on is null and a.contract_end_on >= c.today and a.contract_end_on < c.month_after_next
  join public.tenant_profiles t on t.user_id = a.tenant_id and t.status = 'active'
  join public.rooms r on r.id = a.room_id
  cross join mapsilip_private.accounts owner
  where owner.role = 'owner' and owner.status = 'active'
  on conflict (event_key) do nothing;
$$;

revoke all on function mapsilip_private.notify_owner_contract_expiry() from public, anon, authenticated, service_role;

-- 08:15 Manila, independent of browser and Vercel activity.
select cron.schedule('mapsilip-contract-expiry','15 0 * * *','select mapsilip_private.notify_owner_contract_expiry()');

commit;
