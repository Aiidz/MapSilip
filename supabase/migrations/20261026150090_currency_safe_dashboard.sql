begin;

create or replace function mapsilip_private.dashboard() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); actor_role text; result jsonb;
begin
  actor_role := mapsilip_private.operational_role();
  if actor_role = 'owner' then
    select jsonb_build_object(
      'income_by_currency', (select coalesce(jsonb_agg(jsonb_build_object('currency',t.currency,'amount',t.amount)
        order by t.currency),'[]'::jsonb) from (
          select i.currency, sum(p.amount) amount from public.payments p
          join public.invoices i on i.id = p.invoice_id where p.status = 'approved' group by i.currency
        ) t),
      'occupied_rooms', (select count(distinct room_id) from public.room_assignments where ended_on is null),
      'vacant_rooms', (select count(*) from public.rooms r where r.availability = 'available'
        and not exists (select 1 from public.room_assignments a where a.room_id = r.id and a.ended_on is null)),
      'maintenance_rooms', (select count(*) from public.rooms where availability = 'maintenance'),
      'pending_payments', (select count(*) from public.payments where status = 'pending'),
      'pending_maintenance', (select count(*) from public.maintenance_requests where status <> 'resolved'),
      'pending_accounts', (select count(*) from public.account_requests where status = 'pending'),
      'unread', (select count(*) from public.notifications where recipient_id = actor and read_at is null),
      'weekly_maintenance', (select coalesce(jsonb_agg(jsonb_build_object('day',d.day::date,'count',
        (select count(*) from public.maintenance_requests m where m.created_at::date = d.day::date)) order by d.day),'[]'::jsonb)
        from generate_series(current_date - 6,current_date,interval '1 day') d(day)),
      'monthly_payments', (select coalesce(jsonb_agg(jsonb_build_object('month',t.month,'currency',t.currency,'amount',t.amount)
        order by t.month,t.currency),'[]'::jsonb) from (
          select date_trunc('month',p.reviewed_at)::date as month, i.currency, sum(p.amount) amount
          from public.payments p join public.invoices i on i.id = p.invoice_id
          where p.status = 'approved' and p.reviewed_at >= date_trunc('month',now()) - interval '5 months'
          group by 1,2
        ) t)
    ) into result;
  elsif actor_role = 'caretaker' then
    select jsonb_build_object(
      'open_maintenance', (select count(*) from public.maintenance_requests where status <> 'resolved'),
      'unread', (select count(*) from public.notifications where recipient_id = actor and read_at is null)) into result;
  else
    select jsonb_build_object(
      'room', (select r.room_number from public.room_assignments a join public.rooms r on r.id = a.room_id
        where a.tenant_id = actor and a.ended_on is null limit 1),
      'next_invoice', (select jsonb_build_object('amount',i.amount,'currency',i.currency,'due_on',i.due_on)
        from public.invoices i where i.tenant_id = actor and i.due_on >= current_date order by i.due_on limit 1),
      'unread', (select count(*) from public.notifications where recipient_id = actor and read_at is null),
      'open_maintenance', (select count(*) from public.maintenance_requests where tenant_id = actor and status <> 'resolved')) into result;
  end if;
  return result;
end;
$$;

commit;
