-- The separate source login is provisioned with a SCRAM verifier before these grants.
grant usage on schema public, mapsilip_private, mapsilip_backup to mapsilip_backup_source_login;

-- Scope explicitly to the current recoverable tables. Runtime secrets and ephemeral
-- delivery data are excluded by pg_dump; new tables need a reviewed grant.
do $$
declare
  target record;
begin
  for target in
    select n.nspname, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and (
      (n.nspname = 'public' and c.relname in ('account_requests','attachments','concerns',
        'invoices','maintenance_requests','mapsilip_financial_security_probe','mapsilip_staff_security_probe',
        'notifications','operational_audit','payments','planned_visits','room_assignments','rooms',
        'staff_profiles','storage_archive_items','storage_archives','storage_events',
        'storage_record_reviews','storage_settings','tenant_profiles'))
      or (n.nspname = 'mapsilip_private' and c.relname in ('accounts','auth_attempts','email_events',
        'merchant_qr','push_preferences','push_rate_limits','security_events','signin_rate_limits'))
    )
  loop
    execute format('grant select on %I.%I to mapsilip_backup_source_login', target.nspname, target.relname);
    if target.relrowsecurity then
      execute format('create policy backup_source_read on %I.%I for select to mapsilip_backup_source_login using (true)',
        target.nspname, target.relname);
    end if;
  end loop;
end $$;

grant select on sequence mapsilip_private.security_events_id_seq,
  public.operational_audit_id_seq, public.storage_archive_items_id_seq,
  public.storage_events_id_seq, public.storage_record_reviews_id_seq to mapsilip_backup_source_login;

create function mapsilip_backup.source_auth_inventory()
returns table(id uuid,email text,phone text,created_at timestamptz,email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,deleted_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select u.id,u.email::text,u.phone::text,u.created_at,u.email_confirmed_at,u.phone_confirmed_at,u.deleted_at
  from auth.users u
$$;
revoke all on function mapsilip_backup.source_auth_inventory() from public, anon, authenticated, service_role;
grant execute on function mapsilip_backup.source_auth_inventory() to mapsilip_backup_source_login;
