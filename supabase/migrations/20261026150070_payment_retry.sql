begin;

-- A rejected proof may be corrected and sent again with the same transaction reference.
drop index public.payments_duplicate_reference;
create unique index payments_duplicate_reference on public.payments(tenant_id, method, lower(reference_number))
  where status in ('pending','approved');

commit;
