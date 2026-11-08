-- REVIEW-ONLY HOSTED STORAGE TEST FIXTURE. This is deliberately NOT a migration.
-- Applying it creates one private bucket and two narrowly scoped policies.
-- It is independent of the marker-table RLS fixture and requires separate
-- approval. Never use it for operational files or real user data.
begin;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'mapsilip-security-probe')
    or exists (select 1 from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects') then
    raise exception 'MapSilip Storage probe name or policy collision; inspect before proceeding';
  end if;
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('mapsilip-security-probe', 'mapsilip-security-probe', false, 1048576, array['text/plain']);

create policy mapsilip_security_probe_download on storage.objects
  for select to authenticated using (
    bucket_id = 'mapsilip-security-probe'
    and storage.allow_only_operation('object.get_authenticated')
    and (select mapsilip_private.can_read('finance.read'))
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy mapsilip_security_probe_upload on storage.objects
  for insert to authenticated with check (
    bucket_id = 'mapsilip-security-probe'
    and storage.allow_only_operation('object.upload')
    and (select mapsilip_private.can_read('finance.read'))
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- No UPDATE, DELETE, list-wide, signed-URL, public, copy, or move policy is granted.
commit;
