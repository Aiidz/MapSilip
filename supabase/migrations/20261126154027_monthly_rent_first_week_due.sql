begin;

-- Monthly rent has one shared deadline across automatic and admin-created invoices:
-- partial first-month bills are due on their coverage start; full-month bills are due on day 7.
create or replace function mapsilip_private.set_monthly_rent_due_date()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  month_start date;
  month_end date;
begin
  if lower(btrim(coalesce(new.note, ''))) = 'monthly rent' then
    month_start := date_trunc('month', new.coverage_start)::date;
    month_end := (month_start + interval '1 month - 1 day')::date;

    if new.coverage_end <= month_end then
      new.due_on := greatest(new.coverage_start, month_start + 6);
    end if;
  end if;

  return new;
end;
$$;

alter function mapsilip_private.set_monthly_rent_due_date() owner to postgres;
revoke all on function mapsilip_private.set_monthly_rent_due_date()
  from public, anon, authenticated, service_role, mapsilip_security_executor;

drop trigger if exists invoices_monthly_rent_due_date on public.invoices;
create trigger invoices_monthly_rent_due_date
before insert or update of coverage_start, coverage_end, due_on, note
on public.invoices
for each row
execute function mapsilip_private.set_monthly_rent_due_date();

-- Correct only the current and future monthly invoices; do not rewrite billing history.
update public.invoices
set due_on = greatest(coverage_start, date_trunc('month', coverage_start)::date + 6)
where lower(btrim(coalesce(note, ''))) = 'monthly rent'
  and coverage_start >= date_trunc('month', (now() at time zone 'Asia/Manila')::date)::date
  and coverage_end <= (date_trunc('month', coverage_start) + interval '1 month - 1 day')::date
  and due_on is distinct from greatest(coverage_start, date_trunc('month', coverage_start)::date + 6);

commit;
