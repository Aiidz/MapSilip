begin;

create table mapsilip_private.merchant_qr (
  singleton boolean primary key default true check (singleton),
  version uuid not null default gen_random_uuid(),
  png text not null check (length(png) between 12 and 350000 and png ~ '^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$')
);
revoke all on mapsilip_private.merchant_qr from public, anon, authenticated;

create unique index payments_gcash_active_reference
  on public.payments (lower(btrim(reference_number)))
  where method = 'gcash' and status in ('pending','approved');

create function mapsilip_private.guard_invoice_payment() returns trigger
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
    if new.method <> 'gcash' or bill.currency <> 'PHP' or
      not exists (select 1 from mapsilip_private.merchant_qr) then
      raise exception 'GCash payment unavailable' using errcode = '22023';
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
revoke all on function mapsilip_private.guard_invoice_payment() from public, anon, authenticated;
create trigger guard_invoice_payment before insert or update of status on public.payments
  for each row execute function mapsilip_private.guard_invoice_payment();

do $migration$
declare body text := pg_get_functiondef('mapsilip_private.operate(text,jsonb)'::regprocedure);
        anchor text := '  elsif p_action = ''payment.submit'' then';
begin
  if (length(body) - length(replace(body, anchor, ''))) <> length(anchor) then
    raise exception 'Unexpected payment operation definition';
  end if;
  body := replace(body, anchor, $branch$  elsif p_action = 'payment.qr.read' then
    if actor_role not in ('owner','tenant') or actor_role is null then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    return (select jsonb_build_object('png', png, 'version', version) from mapsilip_private.merchant_qr);
  elsif p_action in ('payment.qr.save','payment.qr.disable') then
    if actor_role is distinct from 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
    if p_action = 'payment.qr.save' then
      insert into mapsilip_private.merchant_qr(png) values(p_data->>'png')
      on conflict (singleton) do update set png = excluded.png, version = excluded.version
      returning version into rec_id;
    else
      delete from mapsilip_private.merchant_qr returning version into rec_id;
    end if;
    if rec_id is not null then
      insert into public.operational_audit(actor_id,action,record_id) values(actor,p_action,rec_id);
    end if;
    return jsonb_build_object('state','saved');
$branch$ || anchor);
  anchor := '    update public.payments set status = status_text, review_note = note_text';
  if (length(body) - length(replace(body, anchor, ''))) <> length(anchor) then
    raise exception 'Unexpected payment review definition';
  end if;
  body := replace(body, anchor, $check$    if payment_rec.method = 'gcash' and status_text = 'approved'
      and (p_data->'gcash_received') is distinct from 'true'::jsonb then
      raise exception 'Verify receipt in the GCash merchant account' using errcode = '22023';
    end if;
$check$ || anchor);
  execute body;
end;
$migration$;

commit;
