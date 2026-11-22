begin;

alter table public.payments
  add column batch_id uuid,
  add column batch_total numeric(12,2),
  add column batch_first boolean not null default true;

-- A submission reserves its proof and reference once, across all its invoice rows.
alter table public.payments drop constraint payments_attachment_id_key;
create unique index payments_single_proof on public.payments(attachment_id) where batch_first;
drop index public.payments_duplicate_reference;
create unique index payments_duplicate_reference on public.payments(tenant_id, method, lower(reference_number))
  where batch_first and status in ('pending','approved');
drop index public.payments_gcash_active_reference;
create unique index payments_gcash_active_reference on public.payments(lower(btrim(reference_number)))
  where batch_first and method = 'gcash' and status in ('pending','approved');
create index payments_batch_id on public.payments(batch_id) where batch_id is not null;

create function mapsilip_private.submit_rent_periods(p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  batch uuid := (p_data->>'request_key')::uuid;
  method_name text := p_data->>'method';
  recipient text := p_data->>'cash_recipient';
  proof uuid := (p_data->>'attachment_id')::uuid;
  reference text := btrim(p_data->>'reference_number');
  invoice_ids uuid[];
  total numeric;
  matched integer;
begin
  if mapsilip_private.operational_role() is distinct from 'tenant' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if batch is null or method_name is null or method_name not in ('gcash','e_wallet','bank_transfer','cash')
      or jsonb_typeof(p_data->'invoice_ids') is distinct from 'array' then
    raise exception 'invalid payment' using errcode = '22023';
  end if;
  select array_agg(distinct value::uuid order by value::uuid) into invoice_ids
  from jsonb_array_elements_text(p_data->'invoice_ids');
  if coalesce(cardinality(invoice_ids),0) not between 1 and 12
      or cardinality(invoice_ids) <> jsonb_array_length(p_data->'invoice_ids') then
    raise exception 'select between 1 and 12 distinct invoices' using errcode = '22023';
  end if;

  -- Lock the same invoices in a consistent order before inserting their payments.
  perform id from public.invoices where id = any(invoice_ids) and tenant_id = actor order by id for update;
  select count(*), sum(amount) into matched,total from public.invoices
    where id = any(invoice_ids) and tenant_id = actor and currency = 'PHP';
  if matched <> cardinality(invoice_ids) then
    raise exception 'invoice unavailable' using errcode = '42501';
  end if;
  if exists(select 1 from public.payments where request_key = batch and tenant_id = actor and batch_id = batch) then
    if (select array_agg(invoice_id order by invoice_id) from public.payments where batch_id = batch) = invoice_ids then
      return jsonb_build_object('state','saved','id',batch);
    end if;
    raise exception 'payment selection changed' using errcode = '22023';
  end if;

  if method_name = 'cash' then
    if recipient is null or recipient not in ('admin','caretaker') then
      raise exception 'cash recipient required' using errcode = '22023';
    end if;
    proof := null;
    reference := 'Cash to ' || recipient || ' ' || batch::text;
  else
    recipient := null;
    if not exists (
      select 1 from public.attachments a join storage.objects o on o.bucket_id = a.bucket_name and o.name = a.path
      where a.id = proof and a.uploader_id = actor and a.purpose = 'payment'
    ) then
      raise exception 'proof unavailable' using errcode = '23514';
    end if;
  end if;

  insert into public.payments(request_key,invoice_id,tenant_id,amount,method,reference_number,attachment_id,cash_recipient,batch_id,batch_total,batch_first)
  select case when i.id = invoice_ids[1] then batch else gen_random_uuid() end,
    i.id,actor,i.amount,method_name,reference,proof,recipient,batch,total,i.id = invoice_ids[1]
  from public.invoices i where i.id = any(invoice_ids) order by i.id;

  insert into public.notifications(recipient_id,title,body,href,event_key)
  select a.user_id,case when method_name = 'cash' then 'Cash payment reported' else 'Payment proof submitted' end,
    'A rent payment for ' || matched || ' billing period(s) is ready for review.',
    '/management/payments','payment:' || batch || ':submitted:' || a.user_id
  from mapsilip_private.accounts a where a.role = 'owner' and a.status = 'active'
  on conflict(event_key) do nothing;
  return jsonb_build_object('state','saved','id',batch);
end;
$$;

create function public.mapsilip_submit_rent_periods(p_data jsonb) returns jsonb
language sql security invoker set search_path = '' as $$
  select mapsilip_private.submit_rent_periods(p_data);
$$;

revoke all on function mapsilip_private.submit_rent_periods(jsonb), public.mapsilip_submit_rent_periods(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function mapsilip_private.submit_rent_periods(jsonb), public.mapsilip_submit_rent_periods(jsonb)
  to authenticated;

-- Apply the owner's review to every invoice covered by the same proof.
create function mapsilip_private.review_rent_periods() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  update public.payments
    set status = new.status, reviewed_at = new.reviewed_at, reviewer_id = new.reviewer_id, review_note = new.review_note
    where batch_id = new.batch_id and id <> new.id and status = 'pending';
  return new;
end;
$$;

revoke all on function mapsilip_private.review_rent_periods() from public, anon, authenticated, service_role;
create trigger review_rent_periods after update of status on public.payments
  for each row when (new.batch_id is not null and old.status = 'pending' and new.status <> 'pending')
  execute function mapsilip_private.review_rent_periods();

commit;
