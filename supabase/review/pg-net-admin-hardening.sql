-- HISTORICAL PROPOSAL: NOT A SUPPORTED SUPABASE PER-PROJECT REMEDIATION. DO NOT RUN.
-- See PUSH_HOSTED_READINESS.md supported security boundary correction.
-- ADMIN REMEDIATION, NOT A READ-ONLY AUDIT QUERY.
-- Intended project: atuqxpiandeutimdkgag. Requires authorized grant-owner execution.
-- Do not run via the existing postgres MCP connection: the precondition will reject it.
-- No secrets, jobs, HTTP calls, push migration or business data changes.
begin;
do $$
begin
  if current_user <> 'supabase_admin' then
    raise exception 'Requires authorized supabase_admin execution; no grants changed';
  end if;
end $$;

revoke all on schema net from public, anon, authenticated;
revoke all on all tables in schema net from public, anon, authenticated;
revoke all on all sequences in schema net from public, anon, authenticated;
revoke all on all functions in schema net from public, anon, authenticated;
grant usage on schema net to postgres;
grant all on all tables in schema net to postgres;
grant all on all sequences in schema net to postgres;
grant execute on all functions in schema net to postgres;

do $$
declare api_role text;
begin
  foreach api_role in array array['anon','authenticated'] loop
    if has_schema_privilege(api_role,'net','USAGE')
      or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='net' and c.relkind in ('r','p','v','m','f')
          and has_table_privilege(api_role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
      or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='net' and c.relkind='S'
          and has_sequence_privilege(api_role,c.oid,'USAGE,SELECT,UPDATE'))
      or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='net' and has_function_privilege(api_role,p.oid,'EXECUTE')) then
      raise exception 'Effective access remains for %; rollback required',api_role;
    end if;
  end loop;
  if not has_schema_privilege('postgres','net','USAGE')
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='net' and not has_function_privilege('postgres',p.oid,'EXECUTE')) then
    raise exception 'Postgres administrative access not preserved; rollback required';
  end if;
end $$;
commit;
