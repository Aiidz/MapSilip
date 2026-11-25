begin;

create schema mapsilip_backup;
revoke all on schema mapsilip_backup from public, anon, authenticated, service_role;

create table mapsilip_backup.oauth_challenges (
  digest text primary key check (length(digest) = 43),
  binding jsonb not null,
  expires_at timestamptz not null
);
create index on mapsilip_backup.oauth_challenges (expires_at);

create table mapsilip_backup.drive_connections (
  owner_id uuid primary key,
  account_id text not null,
  envelope jsonb not null,
  state text not null default 'connected' check (state in ('connected', 'revocation_pending')),
  updated_at timestamptz not null default now()
);

alter table mapsilip_backup.oauth_challenges enable row level security;
alter table mapsilip_backup.drive_connections enable row level security;
revoke all on all tables in schema mapsilip_backup from public, anon, authenticated, service_role;

-- Dedicated server roles and policies are provisioned separately.
commit;
