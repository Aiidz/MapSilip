begin;

-- A first-month invoice starts on the move-in date. Preserve existing coverage.
alter table public.invoices drop constraint invoices_coverage_period_check;
alter table public.invoices add constraint invoices_coverage_period_check check (
  coverage_end = (coverage_start + interval '6 months' - interval '1 day')::date
  or coverage_end = (date_trunc('month',coverage_start) + interval '1 month - 1 day')::date
);

-- Keep the existing approval transaction and attachment validation in place.
create or replace function public.mapsilip_review_account_contract(
  p_id uuid,p_decision text,p_room_id uuid,p_started_on date,p_note text,p_contract_id uuid,p_contract_end_on date
) returns jsonb language sql volatile security invoker set search_path='' as $$
  select mapsilip_private.review_account_contract(
    p_id,p_decision,p_room_id,p_started_on,p_note,p_contract_id,
    case when p_decision='approved'
      then (coalesce(p_started_on,(now() at time zone 'Asia/Manila')::date) + interval '6 months - 1 day')::date
      else p_contract_end_on end);
$$;

create or replace function mapsilip_private.process_monthly_rent() returns void
language plpgsql security definer set search_path='' as $$
declare
 today date := (now() at time zone 'Asia/Manila')::date;
 period date;
 month_end date;
 current_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date;
begin
 -- Serialize scheduled retries. Existing tenant/coverage uniqueness is a second guard.
 if not pg_try_advisory_xact_lock(811327104) then return; end if;
 for period in select current_month union all select (current_month+interval '1 month')::date
 loop
  month_end := (period + interval '1 month - 1 day')::date;
  insert into public.invoices(tenant_id,room_id,coverage_start,coverage_end,due_on,amount,currency,note,created_by)
  select a.tenant_id,a.room_id,greatest(a.started_on,period),month_end,
   greatest(a.started_on,period+6),
   case when a.started_on > period then
     round(coalesce(a.contract_monthly_rent,r.monthly_rent) *
       (month_end-a.started_on+1) / (month_end-period+1),0)
   else coalesce(a.contract_monthly_rent,r.monthly_rent) end,
   'PHP','Monthly rent',a.created_by
  from public.room_assignments a join public.rooms r on r.id=a.room_id
  join public.tenant_profiles t on t.user_id=a.tenant_id
  where a.ended_on is null and t.status='active' and a.started_on<=month_end
   and (a.contract_end_on is null or a.contract_end_on>=period)
   and coalesce(a.contract_monthly_rent,r.monthly_rent)>0
   -- A manually issued or legacy invoice covering this month must not be billed twice.
   and not exists(select 1 from public.invoices i where i.tenant_id=a.tenant_id
    and i.coverage_start <= month_end and i.coverage_end>=period)
  on conflict(tenant_id,coverage_start) do nothing;
 end loop;
 -- Creation notice is retried independently, without duplicate notifications.
 insert into public.notifications(recipient_id,title,body,href,event_key)
 select i.tenant_id,'Rent invoice available',
  'Rent of '||i.currency||' '||i.amount::text||' is due on '||to_char(i.due_on,'Mon DD, YYYY')||'.',
  '/tenant/payments','invoice:'||i.id::text
 from public.invoices i where i.note='Monthly rent' and i.coverage_end>=current_month
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

commit;
