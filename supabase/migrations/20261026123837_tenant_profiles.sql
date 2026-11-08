begin;

create table public.tenant_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

alter table public.tenant_profiles enable row level security;
revoke all on public.tenant_profiles from anon, authenticated;
grant select on public.tenant_profiles to authenticated;

create policy tenant_profiles_read_self on public.tenant_profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

commit;
