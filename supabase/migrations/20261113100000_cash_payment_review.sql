begin;
alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check check(method in ('gcash','e_wallet','bank_transfer','cash'));
alter table public.payments alter column attachment_id drop not null;
alter table public.payments add column cash_recipient text check(cash_recipient in ('admin','caretaker'));
alter table public.payments add constraint payments_proof_required check(
 (method='cash' and cash_recipient is not null) or (method<>'cash' and attachment_id is not null and cash_recipient is null));
-- Amend only the existing payment branches, retaining every role and ownership check.
do $migration$
declare source text := pg_get_functiondef('mapsilip_private.operate(text,jsonb)'::regprocedure); original text;
begin
 original:=source;
 source:=replace(source, '    select * into attachment_rec from public.attachments where id = (p_data->>''attachment_id'')::uuid and uploader_id = actor',
 '    if p_data->>''method'' = ''cash'' then
      if coalesce(p_data->>''cash_recipient'','''') not in (''admin'',''caretaker'') then raise exception ''cash recipient required'' using errcode = ''22023''; end if;
      attachment_rec.id := null;
    else
    select * into attachment_rec from public.attachments where id = (p_data->>''attachment_id'')::uuid and uploader_id = actor');
 source:=replace(source, '    insert into public.payments(request_key,invoice_id,tenant_id,amount,method,reference_number,attachment_id)',
 '    end if;
    insert into public.payments(request_key,invoice_id,tenant_id,amount,method,reference_number,attachment_id,cash_recipient)');
 source:=replace(source, 'trim(p_data->>''reference_number''),attachment_rec.id)',
 'case when p_data->>''method''=''cash'' then ''Cash to ''||(p_data->>''cash_recipient'') else trim(p_data->>''reference_number'') end,attachment_rec.id,case when p_data->>''method''=''cash'' then p_data->>''cash_recipient'' end)');
 source:=replace(source, 'select a.user_id,''Payment proof submitted'',''A payment proof is ready for review.''',
 'select a.user_id,case when p_data->>''method''=''cash'' then ''Cash payment reported'' else ''Payment proof submitted'' end,case when p_data->>''method''=''cash'' then ''Tenant reported cash handed to ''||(p_data->>''cash_recipient'')||''. Approve only after the admin receives the money.'' else ''A payment proof is ready for review.'' end');
 source:=replace(source, '    update public.payments set status = status_text',
 '    if payment_rec.method=''cash'' and status_text=''approved'' and coalesce(p_data->>''cash_received'','''')<>''true'' then raise exception ''admin must confirm cash received'' using errcode = ''22023''; end if;
    update public.payments set status = status_text');
 if source=original or position('admin must confirm cash received' in source)=0 or position('cash recipient required' in source)=0 then raise exception 'Payment function does not match expected version'; end if;
 execute source;
end $migration$;
commit;
