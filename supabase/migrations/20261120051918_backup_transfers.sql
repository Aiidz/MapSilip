begin;

create table mapsilip_backup.drive_artifacts (
  root_id text not null,
  logical_id text not null,
  parent_id text not null,
  kind text not null check (kind in ('folder','file')),
  drive_id text not null unique,
  session_envelope jsonb,
  acknowledged_bytes bigint not null default 0 check (acknowledged_bytes >= 0),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  verified_bytes bigint check (verified_bytes >= 0),
  verified_at timestamptz,
  primary key (root_id,logical_id)
);
alter table mapsilip_backup.drive_artifacts enable row level security;
revoke all on mapsilip_backup.drive_artifacts from public, anon, authenticated, service_role;

alter table mapsilip_backup.jobs add column capture_seal_sha256 text
  check (capture_seal_sha256 ~ '^[0-9a-f]{64}$');

alter table mapsilip_backup.jobs
  add column capture_fence bigint,
  add column local_receipt_sha256 text check (local_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  add column local_custody_at timestamptz,
  add column drive_inventory jsonb;

alter table mapsilip_backup.drive_connections add column staging_root_id text unique,
  add column worker_seen_at timestamptz;

commit;
