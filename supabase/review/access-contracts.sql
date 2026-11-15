-- Run in a transaction after the access_review_contracts migration; roll back all fixtures.
create temporary table contract_fixture as select
 gen_random_uuid() owner_id, gen_random_uuid() caretaker_id, gen_random_uuid() tenant_id, gen_random_uuid() other_id,
 gen_random_uuid() owner_session, gen_random_uuid() caretaker_session, gen_random_uuid() tenant_session, gen_random_uuid() other_session,
 gen_random_uuid() request_id, gen_random_uuid() room_id, null::uuid attachment_id, null::uuid unused_id;
grant select,update on contract_fixture to authenticated;
insert into auth.users(id,email,email_confirmed_at)
 select owner_id,owner_id||'@example.invalid',now() from contract_fixture union all
 select caretaker_id,caretaker_id||'@example.invalid',now() from contract_fixture union all
 select tenant_id,tenant_id||'@example.invalid',now() from contract_fixture union all
 select other_id,other_id||'@example.invalid',now() from contract_fixture;
insert into auth.sessions(id,user_id)
 select owner_session,owner_id from contract_fixture union all select caretaker_session,caretaker_id from contract_fixture union all
 select tenant_session,tenant_id from contract_fixture union all select other_session,other_id from contract_fixture;
insert into mapsilip_private.accounts(user_id,role,status,password_change_required)
 select owner_id,'owner','active',false from contract_fixture union all select caretaker_id,'caretaker','active',false from contract_fixture;
insert into mapsilip_private.session_admissions(user_id,auth_session_id,security_revision)
 select owner_id,owner_session,1 from contract_fixture union all select caretaker_id,caretaker_session,1 from contract_fixture;
insert into public.tenant_profiles(user_id,display_name,status) select other_id,'Contract isolation fixture','active' from contract_fixture;
insert into public.rooms(id,room_number,floor_label,capacity,monthly_rent,gender_policy)
 select room_id,'fixture-'||left(room_id::text,20),'Contract test floor',1,2300,'female' from contract_fixture;
insert into public.account_requests(id,email,display_name,gender,activated_user_id)
 select request_id,tenant_id||'@example.invalid','Contract approval fixture','female',tenant_id from contract_fixture;
set local role authenticated;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',owner_id,'session_id',owner_session)::text from contract_fixture),true);
update contract_fixture set attachment_id=(public.mapsilip_operate('attachment.begin','{"purpose":"contract","mime_type":"image/jpeg","byte_size":100}'::jsonb)->>'id')::uuid;
update contract_fixture set unused_id=(public.mapsilip_operate('attachment.begin','{"purpose":"contract","mime_type":"image/jpeg","byte_size":100}'::jsonb)->>'id')::uuid;
-- Missing bytes must not be accepted as a saved contract.
do $$ declare f record; begin select * into f from contract_fixture;
 begin perform public.mapsilip_review_account_contract(f.request_id,'approved',f.room_id,current_date,null,f.attachment_id,null); raise exception 'missing object accepted'; exception when check_violation then null; end;
end; $$;
reset role;
-- Simulated object metadata only; no real document or tenant persists after rollback.
insert into storage.objects(bucket_id,name) select 'mapsilip_evidence',a.path from public.attachments a,contract_fixture f where a.id in (f.attachment_id,f.unused_id);
set local role authenticated;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',owner_id,'session_id',owner_session)::text from contract_fixture),true);
do $$ declare f record; r jsonb; begin select * into f from contract_fixture;
 begin perform public.mapsilip_review_account_contract(f.request_id,'approved',f.room_id,current_date,null,f.attachment_id,current_date-1); raise exception 'invalid dates accepted'; exception when invalid_parameter_value then null; end;
 perform public.mapsilip_claim_contract_discard(f.unused_id);
 begin perform public.mapsilip_review_account_contract(f.request_id,'approved',f.room_id,current_date,null,f.unused_id,null); raise exception 'discarded contract accepted'; exception when check_violation then null; end;
 r:=public.mapsilip_review_account_contract(f.request_id,'approved',f.room_id,current_date,null,f.attachment_id,current_date+90);
 if r->>'state'<>'approved' then raise exception 'approval failed'; end if;
 r:=public.mapsilip_review_account_contract(f.request_id,'approved',f.room_id,current_date,null,f.attachment_id,current_date+90);
 if (select count(*) from public.room_assignments where tenant_id=f.tenant_id)<>1 then raise exception 'retry duplicated assignment'; end if;
 if not exists(select 1 from public.room_assignments where tenant_id=f.tenant_id and contract_attachment_id=f.attachment_id and contract_monthly_rent=2300 and contract_end_on=current_date+90) then raise exception 'contract metadata not saved'; end if;
 begin perform public.mapsilip_claim_contract_discard(f.attachment_id); raise exception 'linked contract discard accepted'; exception when check_violation then null; end;
 -- Storage deletion itself must use the Storage API, not direct SQL.
 perform public.mapsilip_discard_contract(f.unused_id);
 if not exists(select 1 from public.attachments where id=f.unused_id) then raise exception 'metadata removed before storage object'; end if;
end; $$;
select set_config('storage.operation','object.get_authenticated',true);
-- The document can be read by its tenant, not another tenant or caretaker.
select set_config('request.jwt.claims',(select jsonb_build_object('sub',tenant_id,'session_id',tenant_session)::text from contract_fixture),true);
do $$ declare f record; begin select * into f from contract_fixture;
 if not exists(select 1 from public.attachments where id=f.attachment_id) then raise exception 'tenant cannot read own contract'; end if;
 if not exists(select 1 from storage.objects where name in(select path from public.attachments where id=f.attachment_id) and bucket_id='mapsilip_evidence') then raise exception 'tenant cannot read own object metadata'; end if;
 begin perform public.mapsilip_operate('attachment.begin','{"purpose":"contract","mime_type":"image/jpeg","byte_size":100}'::jsonb); raise exception 'tenant contract upload accepted'; exception when insufficient_privilege then null; end;
end; $$;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',other_id,'session_id',other_session)::text from contract_fixture),true);
do $$ begin
 if exists(select 1 from public.attachments where id=(select attachment_id from contract_fixture)) then raise exception 'other tenant can read contract'; end if;
 if exists(select 1 from storage.objects where bucket_id='mapsilip_evidence' and name like (select owner_id::text||'/%' from contract_fixture)) then raise exception 'other tenant can read object'; end if;
end; $$;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',caretaker_id,'session_id',caretaker_session)::text from contract_fixture),true);
do $$ begin
 if exists(select 1 from public.attachments where id=(select attachment_id from contract_fixture)) then raise exception 'caretaker can read contract'; end if;
 begin perform public.mapsilip_operate('attachment.begin','{"purpose":"contract","mime_type":"image/jpeg","byte_size":100}'::jsonb); raise exception 'caretaker contract upload accepted'; exception when insufficient_privilege then null; end;
end; $$;
reset role;
select 'contract approval, retry, cleanup and tenant isolation assertions passed' as result;
