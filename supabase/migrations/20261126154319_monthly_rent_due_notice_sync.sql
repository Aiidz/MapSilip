begin;

-- Keep already-created invoice notifications consistent with corrected due dates.
update public.notifications n
set body = regexp_replace(
  n.body,
  'is due on [A-Za-z]{3} [0-9]{2}, [0-9]{4}[.]$',
  'is due on ' || to_char(i.due_on, 'Mon DD, YYYY') || '.'
)
from public.invoices i
where n.event_key = 'invoice:' || i.id::text
  and n.title = 'Rent invoice available'
  and n.body ~ '^Rent of .* is due on [A-Za-z]{3} [0-9]{2}, [0-9]{4}[.]$'
  and lower(btrim(coalesce(i.note, ''))) = 'monthly rent'
  and i.coverage_start >= date_trunc('month', (now() at time zone 'Asia/Manila')::date)::date
  and i.coverage_end <= (date_trunc('month', i.coverage_start) + interval '1 month - 1 day')::date
  and n.body !~ ('is due on ' || to_char(i.due_on, 'Mon DD, YYYY') || '[.]$');

commit;
