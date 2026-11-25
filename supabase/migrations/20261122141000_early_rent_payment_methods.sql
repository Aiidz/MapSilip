begin;

-- The merchant QR is optional. Keep the full-payment and duplicate protections.
create or replace function mapsilip_private.guard_invoice_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bill public.invoices%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.status <> 'approved' or old.status = 'approved' then return new; end if;
  end if;
  select * into strict bill from public.invoices where id = new.invoice_id for update;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.payments where request_key = new.request_key and invoice_id = new.invoice_id and tenant_id = new.tenant_id) then
      return new; -- Existing command resolves the idempotent retry.
    end if;
  end if;
  if new.amount <> bill.amount or new.tenant_id <> bill.tenant_id or exists (
    select 1 from public.payments p where p.invoice_id = new.invoice_id and p.id <> new.id
      and (p.status = 'approved' or (tg_op = 'INSERT' and p.status = 'pending'))
  ) then
    raise exception 'Invoice requires one full payment' using errcode = '23514';
  end if;
  return new;
end;
$$;
-- Permit the last invoice of a contract to cover a partial calendar month.
alter table public.invoices drop constraint invoices_coverage_period_check;
alter table public.invoices add constraint invoices_coverage_period_check check (
  coverage_end = (coverage_start + interval '6 months' - interval '1 day')::date
  or coverage_end between coverage_start and (date_trunc('month',coverage_start) + interval '1 month - 1 day')::date
);

create or replace function mapsilip_private.process_monthly_rent() returns void
language plpgsql security definer set search_path='' as $$
declare
 today date := (now() at time zone 'Asia/Manila')::date;
 current_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date;
begin
 -- Serialize scheduled retries. Existing tenant/coverage uniqueness is a second guard.
 if not pg_try_advisory_xact_lock(811327104) then return; end if;
 insert into public.invoices(tenant_id,room_id,coverage_start,coverage_end,due_on,amount,currency,note,created_by)
 select a.tenant_id,a.room_id,coverage.first_day,coverage.last_day,
   greatest(coverage.first_day,month.period::date+6),
   round(coalesce(a.contract_monthly_rent,r.monthly_rent) *
     (coverage.last_day-coverage.first_day+1) /
     ((month.period + interval '1 month - 1 day')::date-month.period::date+1),2),
   'PHP','Monthly rent',a.created_by
 from public.room_assignments a
 join public.rooms r on r.id=a.room_id
 join public.tenant_profiles t on t.user_id=a.tenant_id
 cross join lateral generate_series(
   greatest(current_month,date_trunc('month',a.started_on)::date)::timestamp,
   coalesce(date_trunc('month',a.contract_end_on),current_month+interval '1 month')::timestamp,
   interval '1 month'
 ) as month(period)
 cross join lateral (
   select greatest(a.started_on,month.period::date) as first_day,
     least(a.contract_end_on,(month.period+interval '1 month - 1 day')::date) as last_day
 ) as coverage
 where a.ended_on is null and t.status='active'
   and coverage.first_day<=coverage.last_day
   and coalesce(a.contract_monthly_rent,r.monthly_rent)>0
   and not exists(select 1 from public.invoices i where i.tenant_id=a.tenant_id
     and i.coverage_start <= (month.period+interval '1 month - 1 day')::date
     and i.coverage_end>=month.period::date)
 on conflict(tenant_id,coverage_start) do nothing;
 -- Creation notice is retried independently, without duplicate notifications.
 insert into public.notifications(recipient_id,title,body,href,event_key)
 select i.tenant_id,'Rent invoice available',
  'Rent of '||i.currency||' '||i.amount::text||' is due on '||to_char(i.due_on,'Mon DD, YYYY')||'.',
  '/tenant/payments','invoice:'||i.id::text
 from public.invoices i where i.note='Monthly rent' and i.coverage_end>=current_month
   and i.coverage_start < current_month+interval '2 months'
   and not exists(select 1 from public.payments p where p.invoice_id=i.id and p.status in ('pending','approved'))
 on conflict(event_key) do nothing;

 insert into public.notifications(recipient_id,title,body,href,event_key)
 select i.tenant_id,case when i.due_on<today then 'Rent overdue' when i.due_on=today then 'Rent due today' else 'Rent reminder' end,
  'Your unpaid rent invoice of '||i.currency||' '||i.amount::text||' is due on '||to_char(i.due_on,'Mon DD, YYYY')||'.',
  '/tenant/payments','rent-reminder:'||i.id::text||':'||(i.due_on-today)::text
 from public.invoices i
 where i.due_on-today in (7,3,0,-1)
  and coalesce((select sum(p.amount) from public.payments p where p.invoice_id=i.id and p.status='approved'),0)<i.amount
  and not exists(select 1 from public.payments p where p.invoice_id=i.id and p.status='pending')
 on conflict(event_key) do nothing;
end $$;

select mapsilip_private.process_monthly_rent();

commit;
