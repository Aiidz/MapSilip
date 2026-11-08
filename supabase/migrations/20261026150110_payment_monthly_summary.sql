begin;

create or replace function mapsilip_private.payment_status_summary() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb;
begin
  if mapsilip_private.operational_role() <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
  with invoice_balance as (
    select i.id, i.due_on, i.amount, coalesce(sum(p.amount) filter (where p.status = 'approved'),0) paid
    from public.invoices i left join public.payments p on p.invoice_id = i.id group by i.id
  )
  select jsonb_build_object(
    'paid', count(*) filter (where paid >= amount),
    'pending', count(*) filter (where paid < amount and due_on >= current_date),
    'overdue', count(*) filter (where paid < amount and due_on < current_date),
    'verified_this_month', (select coalesce(jsonb_agg(jsonb_build_object('currency',t.currency,'amount',t.amount)
      order by t.currency),'[]'::jsonb) from (
        select i.currency,sum(p.amount) amount from public.payments p join public.invoices i on i.id=p.invoice_id
        where p.status='approved' and p.reviewed_at >= date_trunc('month',now())
          and p.reviewed_at < date_trunc('month',now()) + interval '1 month'
        group by i.currency
      ) t)
  ) into result from invoice_balance;
  return result;
end;
$$;

commit;
