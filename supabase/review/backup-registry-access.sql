-- Review-only. Run after registry migrations, with psql -v ON_ERROR_STOP=1 -v owner_uuid=...
-- Grant these group roles to separate, non-owner, non-bypassrls server logins in secret provisioning.
begin;
create role mapsilip_backup_web nologin nobypassrls;
create role mapsilip_backup_worker nologin nobypassrls;
grant usage on schema mapsilip_backup to mapsilip_backup_web, mapsilip_backup_worker;
set local search_path = mapsilip_backup, pg_catalog;

grant select,insert,delete on oauth_challenges to mapsilip_backup_web;
create policy web_challenges on oauth_challenges to mapsilip_backup_web
  using (binding->>'userId' = :'owner_uuid'::uuid::text) with check (binding->>'userId' = :'owner_uuid'::uuid::text);
grant select,insert,update,delete on drive_connections to mapsilip_backup_web;
grant select,update(envelope,updated_at,staging_root_id,worker_seen_at) on drive_connections to mapsilip_backup_worker;
create policy server_connection on drive_connections to mapsilip_backup_web,mapsilip_backup_worker
  using (owner_id=:'owner_uuid'::uuid) with check (owner_id=:'owner_uuid'::uuid);

grant select,insert(owner_id,job_key,reason,period),update(state,failure_code,lease_until,updated_at,local_custody_at) on jobs to mapsilip_backup_web;
grant select,update(state,fence,attempts,lease_until,updated_at,failure_code,
  capture_seal_sha256,capture_fence,local_receipt_sha256,drive_inventory,local_verified_at,drive_verified_at)
  on jobs to mapsilip_backup_worker;
create policy server_jobs on jobs to mapsilip_backup_web,mapsilip_backup_worker
  using (owner_id=:'owner_uuid'::uuid) with check (owner_id=:'owner_uuid'::uuid);

grant select,insert,update on schedule_settings to mapsilip_backup_web;
create policy web_schedule on schedule_settings to mapsilip_backup_web
  using (owner_id=:'owner_uuid'::uuid) with check (owner_id=:'owner_uuid'::uuid);

grant select(root_id,logical_id,parent_id,kind,drive_id,sha256,verified_bytes,verified_at) on drive_artifacts to mapsilip_backup_web;
create policy web_verified_artifacts on drive_artifacts for select to mapsilip_backup_web
  using (kind='file' and verified_at is not null and exists(
    select 1 from mapsilip_backup.drive_connections c where c.staging_root_id=root_id and c.state='connected'));

grant select,insert,update(session_envelope,acknowledged_bytes,verified_at,verified_bytes,sha256) on drive_artifacts to mapsilip_backup_worker;
create policy worker_artifacts on drive_artifacts to mapsilip_backup_worker
  using (exists(select 1 from mapsilip_backup.drive_connections c where c.staging_root_id=root_id and c.state='connected'));
commit;
