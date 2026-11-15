begin;
-- Preserve legacy six-month invoices while allowing calendar-month billing.
alter table public.invoices drop constraint invoices_check;
alter table public.invoices add constraint invoices_coverage_period_check check (
 coverage_end = (coverage_start + interval '6 months' - interval '1 day')::date
 or (extract(day from coverage_start)=1 and coverage_end=(coverage_start + interval '1 month' - interval '1 day')::date)
);

create function mapsilip_private.process_monthly_rent() returns void
language plpgsql security definer set search_path='' as $$
declare
 today date := (now() at time zone 'Asia/Manila')::date;
 period date;
 current_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date;
begin
 -- Serialize scheduled retries. Existing tenant/coverage uniqueness is a second guard.
 if not pg_try_advisory_xact_lock(811327104) then return; end if;
 for period in select current_month union all select (current_month+interval '1 month')::date
 loop
  insert into public.invoices(tenant_id,room_id,coverage_start,coverage_end,due_on,amount,currency,note,created_by)
  select a.tenant_id,a.room_id,period,(period+interval '1 month'-interval '1 day')::date,period,
   coalesce(a.contract_monthly_rent,r.monthly_rent),'PHP','Monthly rent',a.created_by
  from public.room_assignments a join public.rooms r on r.id=a.room_id
  join public.tenant_profiles t on t.user_id=a.tenant_id
  where a.ended_on is null and t.status='active' and a.started_on<=period
   and (a.contract_end_on is null or a.contract_end_on>=period)
   and coalesce(a.contract_monthly_rent,r.monthly_rent)>0
   -- A manually issued or legacy invoice covering this month must not be billed twice.
   and not exists(select 1 from public.invoices i where i.tenant_id=a.tenant_id
    and i.coverage_start <= (period+interval '1 month'-interval '1 day')::date and i.coverage_end>=period)
  on conflict(tenant_id,coverage_start) do nothing;
 end loop;
 -- Creation notice is retried independently, without duplicate notifications.
 insert into public.notifications(recipient_id,title,body,href,event_key)
 select i.tenant_id,'Rent invoice available',
  'Rent of '||i.currency||' '||i.amount::text||' is due on '||to_char(i.due_on,'Mon DD, YYYY')||'.',
  '/tenant/payments','invoice:'||i.id::text
 from public.invoices i where i.note='Monthly rent' and i.coverage_start>=current_month
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
alter function mapsilip_private.process_monthly_rent() owner to postgres;
revoke all on function mapsilip_private.process_monthly_rent() from public,anon,authenticated,service_role,mapsilip_security_executor;

-- 08:00 Manila daily; independent of browser visits or Vercel traffic.
select cron.schedule('mapsilip-monthly-rent','0 0 * * *','select mapsilip_private.process_monthly_rent()');
-- Reminder events use the existing payment push preferences and delivery pipeline.
create or replace function mapsilip_private.push_classify(k text) returns text
language plpgsql immutable set search_path='' as $$
declare u text:='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
begin
 if k ~ ('^rent-reminder:'||u||':(7|3|0|-1)$') then return 'payments'; end if;
 if k ~ ('^invoice:'||u||'$') or k ~ ('^payment:'||u||':(approved|rejected)$') or k ~ ('^payment:'||u||':submitted:'||u||'$') then return 'payments'; end if;
 if k ~ ('^maintenance:'||u||':(in_progress|resolved)$') or k ~ ('^maintenance:'||u||':submitted:'||u||'$') then return 'maintenance'; end if;
 if k ~ ('^assignment:'||u||'$') or k ~ ('^room-prep:'||u||':'||u||'$') or k ~ ('^account-request:'||u||':(approved|rejected)$') or k ~ ('^account-request:'||u||':created:'||u||'$') then return 'accounts'; end if;
 if k ~ ('^visit:'||u||':(planned|cancelled):'||u||'$') then return 'visitors'; end if;
 if k ~ ('^concern:'||u||':resolved$') or k ~ ('^concern:'||u||':submitted:'||u||'$') then return 'concerns'; end if;
 return null;
end $$;
create function public.mapsilip_next_rent_invoice() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',i.id,'amount',i.amount,'currency',i.currency,'due_on',i.due_on,
  'coverage_start',i.coverage_start,'coverage_end',i.coverage_end)
 from public.invoices i where i.tenant_id=auth.uid()
 and coalesce((select sum(p.amount) from public.payments p where p.invoice_id=i.id and p.status='approved'),0)<i.amount
 order by i.due_on,i.created_at limit 1
$$;
revoke all on function public.mapsilip_next_rent_invoice() from public,anon,service_role;
grant execute on function public.mapsilip_next_rent_invoice() to authenticated;
-- Initialize only the current billing window; never backfill historical months.
select mapsilip_private.process_monthly_rent();
commit;
