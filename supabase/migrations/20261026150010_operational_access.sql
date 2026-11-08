begin;

create function mapsilip_private.tenant_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from public.tenant_profiles p where p.user_id = auth.uid() and p.status = 'active')
    and exists (select 1 from auth.users u where u.id = auth.uid() and u.deleted_at is null
      and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now()))
    and exists (select 1 from auth.sessions s where s.user_id = auth.uid()
      and s.id::text = auth.jwt()->>'session_id' and (s.not_after is null or s.not_after > now()));
$$;

create function mapsilip_private.operational_role() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); sid_text text := auth.jwt()->>'session_id'; sid uuid;
  a mapsilip_private.accounts%rowtype; tenant_status text;
begin
  if uid is null or sid_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  sid := sid_text::uuid;
  if not exists (select 1 from auth.users u join auth.sessions s on s.user_id = u.id
     where u.id = uid and s.id = sid and u.deleted_at is null
       and (u.banned_until is null or u.banned_until <= now())
       and (s.not_after is null or s.not_after > now())) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into a from mapsilip_private.accounts where user_id = uid for update;
  if found then
    if a.status <> 'active' or a.password_change_required or not exists (
      select 1 from mapsilip_private.session_admissions g where g.user_id = uid
        and g.auth_session_id = sid and g.security_revision = a.security_revision) then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    return a.role;
  end if;
  select p.status into tenant_status from public.tenant_profiles p where p.user_id = uid for update;
  if tenant_status = 'active' and exists (select 1 from auth.users u where u.id = uid and u.email_confirmed_at is not null) then
    return 'tenant';
  end if;
  raise exception 'not authorized' using errcode = '42501';
end;
$$;

alter function mapsilip_private.tenant_active() owner to postgres;
alter function mapsilip_private.operational_role() owner to postgres;
revoke all on function mapsilip_private.tenant_active(), mapsilip_private.operational_role() from public, anon, authenticated, service_role, mapsilip_security_executor;
grant execute on function mapsilip_private.tenant_active() to authenticated;

-- Existing profile rule only checked uid; active, live sessions are required for operational reads.
drop policy tenant_profiles_read_self on public.tenant_profiles;
create policy tenant_profiles_read_self on public.tenant_profiles for select to authenticated
  using (user_id = (select auth.uid()) and (select mapsilip_private.tenant_active()));
create policy tenant_profiles_owner_read on public.tenant_profiles for select to authenticated
  using ((select mapsilip_private.can_read('tenant.application.approve')));

create policy account_requests_owner_read on public.account_requests for select to authenticated
  using ((select mapsilip_private.can_read('tenant.application.approve')));
create policy rooms_staff_read on public.rooms for select to authenticated
  using ((select mapsilip_private.can_read('staff.access.inspect')));
create policy rooms_tenant_read on public.rooms for select to authenticated
  using ((select mapsilip_private.tenant_active()) and exists (
    select 1 from public.room_assignments ra where ra.room_id = rooms.id and ra.tenant_id = (select auth.uid()) and ra.ended_on is null));
create policy room_assignments_owner_read on public.room_assignments for select to authenticated
  using ((select mapsilip_private.can_read('tenant.application.approve')));
create policy room_assignments_tenant_read on public.room_assignments for select to authenticated
  using (tenant_id = (select auth.uid()) and (select mapsilip_private.tenant_active()));
create policy invoices_owner_read on public.invoices for select to authenticated
  using ((select mapsilip_private.can_read('finance.read')));
create policy invoices_tenant_read on public.invoices for select to authenticated
  using (tenant_id = (select auth.uid()) and (select mapsilip_private.tenant_active()));
create policy payments_owner_read on public.payments for select to authenticated
  using ((select mapsilip_private.can_read('finance.read')));
create policy payments_tenant_read on public.payments for select to authenticated
  using (tenant_id = (select auth.uid()) and (select mapsilip_private.tenant_active()));
create policy maintenance_staff_read on public.maintenance_requests for select to authenticated
  using ((select mapsilip_private.can_read('staff.access.inspect')));
create policy maintenance_tenant_read on public.maintenance_requests for select to authenticated
  using (tenant_id = (select auth.uid()) and (select mapsilip_private.tenant_active()));
create policy concerns_owner_read on public.concerns for select to authenticated
  using ((select mapsilip_private.can_read('tenant.application.approve')));
create policy concerns_tenant_read on public.concerns for select to authenticated
  using (tenant_id = (select auth.uid()) and (select mapsilip_private.tenant_active()));
create policy visits_owner_read on public.planned_visits for select to authenticated
  using ((select mapsilip_private.can_read('tenant.application.approve')));
create policy visits_tenant_read on public.planned_visits for select to authenticated
  using (tenant_id = (select auth.uid()) and (select mapsilip_private.tenant_active()));
create policy notifications_recipient_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and
    ((select mapsilip_private.tenant_active()) or (select mapsilip_private.can_read('staff.access.inspect'))));
create policy attachments_own_read on public.attachments for select to authenticated
  using (uploader_id = (select auth.uid()) and
    ((select mapsilip_private.tenant_active()) or (select mapsilip_private.can_read('staff.access.inspect'))));
create policy attachments_staff_read on public.attachments for select to authenticated
  using ((purpose = 'payment' and (select mapsilip_private.can_read('finance.read'))) or
         (purpose = 'maintenance' and (select mapsilip_private.can_read('staff.access.inspect'))));
create policy staff_profiles_own_read on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) and (select mapsilip_private.can_read('staff.access.inspect')));

-- RLS controls reads; only reviewed transactional commands below will receive writes.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  values ('mapsilip_evidence', 'mapsilip_evidence', false, 2097152,
    array['image/jpeg','image/png','application/pdf']::text[])
  on conflict (id) do nothing;

create policy mapsilip_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'mapsilip_evidence' and exists (
    select 1 from public.attachments a where a.path = name and a.uploader_id = (select auth.uid())
      and not exists (select 1 from public.payments p where p.attachment_id = a.id)
      and not exists (select 1 from public.maintenance_requests m where m.attachment_id = a.id)
      and ((select mapsilip_private.tenant_active()) or (select mapsilip_private.can_read('staff.access.inspect')))));
create policy mapsilip_evidence_download on storage.objects for select to authenticated
  using (bucket_id = 'mapsilip_evidence' and storage.allow_only_operation('download') and exists (
    select 1 from public.attachments a where a.path = name and (
      (a.purpose = 'payment' and exists (select 1 from public.payments p where p.attachment_id = a.id)
        and ((a.uploader_id = (select auth.uid()) and (select mapsilip_private.tenant_active()))
          or (select mapsilip_private.can_read('finance.read'))))
      or (a.purpose = 'maintenance' and exists (select 1 from public.maintenance_requests m where m.attachment_id = a.id)
        and ((a.uploader_id = (select auth.uid()) and (select mapsilip_private.tenant_active()))
          or (select mapsilip_private.can_read('staff.access.inspect'))))
      or (a.purpose = 'profile' and a.uploader_id = (select auth.uid())
        and ((select mapsilip_private.tenant_active()) or (select mapsilip_private.can_read('staff.access.inspect'))))
  )));

commit;
