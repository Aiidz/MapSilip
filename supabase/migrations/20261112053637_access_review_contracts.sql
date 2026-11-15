begin;

alter table public.attachments add column discarded_at timestamptz;
alter table public.attachments drop constraint attachments_purpose_check;
alter table public.attachments add constraint attachments_purpose_check check (purpose in ('payment','maintenance','profile','contract'));
alter table public.room_assignments
  add column contract_attachment_id uuid unique references public.attachments(id) on delete restrict,
  add column contract_end_on date,
  add column contract_monthly_rent numeric(12,2) check (contract_monthly_rent > 0),
  add constraint contract_dates_valid check (contract_end_on is null or contract_end_on >= started_on);

-- Extend the existing command rather than creating a second upload path.
do $migration$
declare definition text; old_fragment text := $old$p_data->>'purpose' not in ('payment','maintenance','profile')$old$;
begin
 definition := pg_get_functiondef('mapsilip_private.operate(text,jsonb)'::regprocedure);
 if position(old_fragment in definition)=0 then raise exception 'attachment command differs from expected definition'; end if;
 definition := replace(definition,old_fragment,$new$(p_data->>'purpose' not in ('payment','maintenance','profile','contract') or (p_data->>'purpose' = 'contract' and actor_role <> 'owner'))$new$);
 execute definition;
end;
$migration$;

alter policy attachments_own_read on public.attachments using (
 purpose <> 'contract' and uploader_id = (select auth.uid()) and
 ((select mapsilip_private.tenant_active()) or (select mapsilip_private.can_read('staff.access.inspect'))));
create policy attachments_contract_read on public.attachments for select to authenticated using (
 purpose='contract' and ((select mapsilip_private.can_read('tenant.application.approve')) or
 ((select mapsilip_private.tenant_active()) and exists (
  select 1 from public.room_assignments a where a.contract_attachment_id=attachments.id and a.tenant_id=(select auth.uid())))));
create policy contract_document_read on storage.objects for select to authenticated using (
 bucket_id='mapsilip_evidence' and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated']) and exists (
 select 1 from public.attachments a where a.path=name and a.purpose='contract' and
 ((select mapsilip_private.can_read('tenant.application.approve')) or
 ((select mapsilip_private.tenant_active()) and exists (select 1 from public.room_assignments r where r.contract_attachment_id=a.id and r.tenant_id=(select auth.uid()))))));

-- Retain existing evidence upload restrictions and narrow contracts to their owner uploader.
do $migration$
declare original text;
begin
 select with_check into original from pg_policies where schemaname='storage' and tablename='objects' and policyname='mapsilip_evidence_upload';
 if original is null then raise exception 'missing evidence upload policy'; end if;
 execute 'alter policy mapsilip_evidence_upload on storage.objects with check ((' || original || $condition$) and not exists (
 select 1 from public.attachments c where c.path=name and c.purpose='contract' and
 (not (select mapsilip_private.can_read('tenant.application.approve')) or exists (select 1 from public.room_assignments r where r.contract_attachment_id=c.id))))$condition$;
end;
$migration$;

create function mapsilip_private.review_account_contract(
 p_id uuid,p_decision text,p_room_id uuid,p_started_on date,p_note text,p_contract_id uuid,p_contract_end_on date
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare request_row public.account_requests%rowtype; attachment public.attachments%rowtype; result jsonb; rate numeric;
begin
 if not mapsilip_private.can_read('tenant.application.approve') then raise exception 'not authorized' using errcode='42501'; end if;
 select * into request_row from public.account_requests where id=p_id for update;
 if not found then raise exception 'request not found' using errcode='P0002'; end if;
 if p_decision='rejected' and (p_note is null or length(trim(p_note)) not between 1 and 500) then raise exception 'rejection reason required' using errcode='22023'; end if;
 if p_decision='rejected' and (p_contract_id is not null or p_contract_end_on is not null) then raise exception 'contract requires approval' using errcode='22023'; end if;
 if request_row.status <> 'pending' then
   if request_row.status <> p_decision then raise exception 'request already reviewed' using errcode='23505'; end if;
   -- A retry cannot replace a contract or alter an already approved assignment.
   if p_decision='approved' and not exists(select 1 from public.room_assignments a where a.tenant_id=request_row.activated_user_id and a.room_id=p_room_id and a.ended_on is null and a.contract_attachment_id is not distinct from p_contract_id and a.contract_end_on is not distinct from p_contract_end_on) then raise exception 'request already reviewed' using errcode='23505'; end if;
   return mapsilip_private.review_account_request(p_id,p_decision,null,p_room_id,p_started_on,p_note);
 end if;
 if p_contract_end_on is not null and p_contract_end_on < coalesce(p_started_on,(now() at time zone 'Asia/Manila')::date) then raise exception 'contract end precedes start' using errcode='22023'; end if;
 if p_contract_id is not null then
   select * into attachment from public.attachments where id=p_contract_id and uploader_id=auth.uid() and purpose='contract' and discarded_at is null and mime_type in ('image/jpeg','image/png') for update;
   if not found or not exists(select 1 from storage.objects where bucket_id='mapsilip_evidence' and name=attachment.path) or exists(select 1 from public.room_assignments where contract_attachment_id=p_contract_id) then raise exception 'contract unavailable' using errcode='23514'; end if;
 end if;
 -- The existing review transaction validates identity, occupancy, gender and current authority.
 result := mapsilip_private.review_account_request(p_id,p_decision,null,p_room_id,p_started_on,p_note);
 if p_decision='approved' then
   select monthly_rent into rate from public.rooms where id=p_room_id;
   update public.room_assignments set contract_attachment_id=p_contract_id,contract_end_on=p_contract_end_on,contract_monthly_rent=rate
   where tenant_id=request_row.activated_user_id and room_id=p_room_id and ended_on is null;
 end if;
 return result;
end; $$;
revoke all on function mapsilip_private.review_account_contract(uuid,text,uuid,date,text,uuid,date) from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.review_account_contract(uuid,text,uuid,date,text,uuid,date) to authenticated;
create function public.mapsilip_review_account_contract(p_id uuid,p_decision text,p_room_id uuid,p_started_on date,p_note text,p_contract_id uuid,p_contract_end_on date)
returns jsonb language sql volatile security invoker set search_path='' as $$
 select mapsilip_private.review_account_contract(p_id,p_decision,p_room_id,p_started_on,p_note,p_contract_id,p_contract_end_on);
$$;
revoke all on function public.mapsilip_review_account_contract(uuid,text,uuid,date,text,uuid,date) from public,anon,authenticated,service_role;
grant execute on function public.mapsilip_review_account_contract(uuid,text,uuid,date,text,uuid,date) to authenticated;

-- Only unused contract uploads can be discarded; linked documents are immutable here.
create policy unused_contract_delete on storage.objects for delete to authenticated using (
 bucket_id='mapsilip_evidence' and (select mapsilip_private.can_read('tenant.application.approve')) and exists (
 select 1 from public.attachments a where a.path=name and a.purpose='contract' and a.discarded_at is not null and a.uploader_id=(select auth.uid()) and not exists(select 1 from public.room_assignments r where r.contract_attachment_id=a.id)));
create function mapsilip_private.claim_contract_discard(p_id uuid) returns text language plpgsql volatile security definer set search_path='' as $$
declare attachment public.attachments%rowtype;
begin
 if not mapsilip_private.can_read('tenant.application.approve') then raise exception 'not authorized' using errcode='42501'; end if;
 select * into attachment from public.attachments where id=p_id and purpose='contract' and uploader_id=auth.uid() for update;
 if not found or exists(select 1 from public.room_assignments where contract_attachment_id=p_id) then raise exception 'contract unavailable' using errcode='23514'; end if;
 update public.attachments set discarded_at=now() where id=p_id;
 return attachment.path;
end; $$;
revoke all on function mapsilip_private.claim_contract_discard(uuid) from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.claim_contract_discard(uuid) to authenticated;
create function public.mapsilip_claim_contract_discard(p_id uuid) returns text language sql volatile security invoker set search_path='' as $$ select mapsilip_private.claim_contract_discard(p_id); $$;
revoke all on function public.mapsilip_claim_contract_discard(uuid) from public,anon,authenticated,service_role;
grant execute on function public.mapsilip_claim_contract_discard(uuid) to authenticated;
create function mapsilip_private.discard_contract(p_id uuid) returns void language plpgsql volatile security definer set search_path='' as $$
begin
 if not mapsilip_private.can_read('tenant.application.approve') then raise exception 'not authorized' using errcode='42501'; end if;
 delete from public.attachments a where a.id=p_id and a.purpose='contract' and a.discarded_at is not null and a.uploader_id=auth.uid()
 and not exists(select 1 from public.room_assignments r where r.contract_attachment_id=a.id)
 and not exists(select 1 from storage.objects o where o.bucket_id='mapsilip_evidence' and o.name=a.path);
end; $$;
revoke all on function mapsilip_private.discard_contract(uuid) from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.discard_contract(uuid) to authenticated;
create function public.mapsilip_discard_contract(p_id uuid) returns void language sql volatile security invoker set search_path='' as $$ select mapsilip_private.discard_contract(p_id); $$;
revoke all on function public.mapsilip_discard_contract(uuid) from public,anon,authenticated,service_role;
grant execute on function public.mapsilip_discard_contract(uuid) to authenticated;
commit;
