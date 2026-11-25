begin;

create table mapsilip_backup.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  job_key text not null,
  reason text not null check (reason in ('manual', 'monthly')),
  period text check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  state text not null default 'queued'
    check (state in ('queued','collecting','packaging','uploading','verifying','completed','partially_completed','failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fence bigint not null default 0,
  attempts integer not null default 0,
  lease_until timestamptz,
  failure_code text,
  local_verified_at timestamptz,
  drive_verified_at timestamptz,
  unique (owner_id, job_key),
  check (state <> 'completed' or drive_verified_at is not null)
);
create index on mapsilip_backup.jobs (created_at, id)
  where state in ('queued','collecting','packaging','uploading','verifying');
create index on mapsilip_backup.jobs (owner_id, created_at desc, id desc);
alter table mapsilip_backup.jobs enable row level security;
revoke all on mapsilip_backup.jobs from public, anon, authenticated, service_role;

create table mapsilip_backup.schedule_settings (
  owner_id uuid primary key,
  monthly_enabled boolean not null default false
);
alter table mapsilip_backup.schedule_settings enable row level security;
revoke all on mapsilip_backup.schedule_settings from public, anon, authenticated, service_role;

commit;
