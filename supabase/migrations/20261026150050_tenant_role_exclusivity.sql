begin;

create or replace function mapsilip_private.tenant_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and not exists (select 1 from mapsilip_private.accounts a where a.user_id = auth.uid())
    and exists (select 1 from public.tenant_profiles p where p.user_id = auth.uid() and p.status = 'active')
    and exists (select 1 from auth.users u where u.id = auth.uid() and u.deleted_at is null
      and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now()))
    and exists (select 1 from auth.sessions s where s.user_id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id' and (s.not_after is null or s.not_after > now()));
$$;

commit;
