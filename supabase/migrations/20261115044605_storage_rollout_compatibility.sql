begin;

-- The previous deployed upload endpoint cannot issue the new verification receipt.
-- Keep those uploads honestly labelled legacy until a coordinated code rollout.
do $rollout_guard$
begin
 if (select enforce_validated_uploads from mapsilip_private.storage_receipt_key where singleton) then
  raise exception 'Storage controls already active; do not relax upload enforcement';
 end if;
end; $rollout_guard$;
alter table public.attachments alter column legacy_upload set default true;
update public.attachments set legacy_upload=true where upload_state='unknown' and not legacy_upload;

create or replace function mapsilip_private.activate_storage_controls() returns void
language plpgsql security invoker set search_path='' as $$
begin
 -- Serialize the last compatibility upload against the default/enforcement switch.
 lock table public.attachments in share row exclusive mode;
 update public.attachments set legacy_upload=true where upload_state='unknown' and not legacy_upload;
 alter table public.attachments alter column legacy_upload set default false;
 update mapsilip_private.storage_receipt_key set enforce_validated_uploads=true where singleton;
 drop policy if exists unused_contract_delete on storage.objects;
 revoke execute on function public.mapsilip_claim_contract_discard(uuid),public.mapsilip_discard_contract(uuid),mapsilip_private.claim_contract_discard(uuid),mapsilip_private.discard_contract(uuid) from authenticated;
end; $$;
revoke all on function mapsilip_private.activate_storage_controls() from public,anon,authenticated,service_role;
commit;
