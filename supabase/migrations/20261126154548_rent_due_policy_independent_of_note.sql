begin;

-- Invoice rows represent rent, so the schedule is based on coverage dates, not the optional note.
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
  month_start := date_trunc('month', new.coverage_start)::date;
  month_end := (month_start + interval '1 month - 1 day')::date;

  if new.coverage_end <= month_end then
    new.due_on := greatest(new.coverage_start, month_start + 6);
  end if;

  return new;
end;
$$;

-- Correct current and future one-month invoices, including ones with a custom or blank note.
update public.invoices
set due_on = greatest(coverage_start, date_trunc('month', coverage_start)::date + 6)
where coverage_start >= date_trunc('month', (now() at time zone 'Asia/Manila')::date)::date
  and coverage_end <= (date_trunc('month', coverage_start) + interval '1 month - 1 day')::date
  and due_on is distinct from greatest(coverage_start, date_trunc('month', coverage_start)::date + 6);

-- Sync dated rent notices for any current or future one-month invoice.
update public.notifications n
set body = regexp_replace(
  n.body,
  'is due on [A-Za-z]{3} [0-9]{2}, [0-9]{4}[.]$',
  'is due on ' || to_char(i.due_on, 'Mon DD, YYYY') || '.'
)
from public.invoices i
where n.event_key = 'invoice:' || i.id::text
  and n.title in ('Rent invoice available', 'Invoice available')
  and n.body ~ '^Rent of .* is due on [A-Za-z]{3} [0-9]{2}, [0-9]{4}[.]$'
  and i.coverage_start >= date_trunc('month', (now() at time zone 'Asia/Manila')::date)::date
  and i.coverage_end <= (date_trunc('month', i.coverage_start) + interval '1 month - 1 day')::date
  and n.body !~ ('is due on ' || to_char(i.due_on, 'Mon DD, YYYY') || '[.]$');

commit;
