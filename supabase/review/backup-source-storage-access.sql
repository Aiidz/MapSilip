-- Review-only: scoped machine identity for private original-file reads.
begin;
create policy backup_worker_source_read on storage.objects
for select to authenticated using (
  bucket_id = 'mapsilip_evidence' and (select auth.uid()) = :'source_subject'::uuid
);

-- Permissive policies are ORed together. These restrictions also apply when
-- another policy would otherwise authorize the designated subject.
create policy backup_worker_evidence_only on storage.objects
as restrictive for select to authenticated using (
  (select auth.uid()) is distinct from :'source_subject'::uuid
  or bucket_id = 'mapsilip_evidence'
);
create policy backup_worker_no_insert on storage.objects
as restrictive for insert to authenticated with check (
  (select auth.uid()) is distinct from :'source_subject'::uuid
);
create policy backup_worker_no_update on storage.objects
as restrictive for update to authenticated
using ((select auth.uid()) is distinct from :'source_subject'::uuid)
with check ((select auth.uid()) is distinct from :'source_subject'::uuid);
create policy backup_worker_no_delete on storage.objects
as restrictive for delete to authenticated using (
  (select auth.uid()) is distinct from :'source_subject'::uuid
);

commit;
