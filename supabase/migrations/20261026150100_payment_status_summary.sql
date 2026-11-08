begin;

create function mapsilip_private.payment_status_summary() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb;
begin
  if mapsilip_private.operational_role() <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
  with invoice_balance as (
    select i.id, i.due_on, i.amount, coalesce(sum(p.amount) filter (where p.status = 'approved'),0) paid
    from public.invoices i left join public.payments p on p.invoice_id = i.id
    group by i.id
  )
  select jsonb_build_object(
    'paid', count(*) filter (where paid >= amount),
    'pending', count(*) filter (where paid < amount and due_on >= current_date),
    'overdue', count(*) filter (where paid < amount and due_on < current_date))
  into result from invoice_balance;
  return result;
end;
$$;
create function public.mapsilip_payment_status_summary() returns jsonb
language sql volatile security invoker set search_path = '' as $$
  select mapsilip_private.payment_status_summary();
$$;
alter function mapsilip_private.payment_status_summary() owner to postgres;
alter function public.mapsilip_payment_status_summary() owner to postgres;
revoke all on function mapsilip_private.payment_status_summary(), public.mapsilip_payment_status_summary()
  from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.payment_status_summary(), public.mapsilip_payment_status_summary()
  to authenticated;

commit;
