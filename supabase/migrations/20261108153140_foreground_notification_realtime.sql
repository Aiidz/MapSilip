-- Candidate only. Requires separate hosted authorization; no new grants or policies.
begin;
do $$
begin
 if not exists(select 1 from pg_class where oid='public.notifications'::regclass and relrowsecurity) then
  raise exception 'Notification RLS must remain enabled';
 end if;
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
  raise exception 'Existing Supabase Realtime publication is required';
 end if;
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
  alter publication supabase_realtime add table public.notifications;
 end if;
end $$;
commit;
