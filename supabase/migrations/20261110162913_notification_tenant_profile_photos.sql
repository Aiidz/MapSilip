-- Local candidate only. Hosted application requires separate authorization.
-- Allow existing authorized staff to view tenant profile images, while keeping
-- profile attachment metadata and private Storage downloads behind RLS.
begin;

create function mapsilip_private.can_read_tenant_photo(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and mapsilip_private.can_read('staff.access.inspect')
    and exists (select 1 from public.tenant_profiles p where p.user_id = p_user_id);
$$;
alter function mapsilip_private.can_read_tenant_photo(uuid) owner to postgres;
revoke all on function mapsilip_private.can_read_tenant_photo(uuid) from public, anon, authenticated, service_role;
grant execute on function mapsilip_private.can_read_tenant_photo(uuid) to authenticated;

alter policy attachments_staff_read on public.attachments
  using ((purpose = 'payment' and (select mapsilip_private.can_read('finance.read'))) or
         (purpose = 'maintenance' and (select mapsilip_private.can_read('staff.access.inspect'))) or
         (purpose = 'profile' and mapsilip_private.can_read_tenant_photo(uploader_id)));

alter policy mapsilip_evidence_download on storage.objects
  using (bucket_id = 'mapsilip_evidence'
    and storage.allow_any_operation(array['object.get_authenticated_info', 'object.get_authenticated'])
    and exists (
      select 1 from public.attachments a where a.path = name and (
        (a.purpose = 'payment' and exists (select 1 from public.payments p where p.attachment_id = a.id)
          and ((a.uploader_id = (select auth.uid()) and (select mapsilip_private.tenant_active()))
            or (select mapsilip_private.can_read('finance.read'))))
        or (a.purpose = 'maintenance' and exists (select 1 from public.maintenance_requests m where m.attachment_id = a.id)
          and ((a.uploader_id = (select auth.uid()) and (select mapsilip_private.tenant_active()))
            or (select mapsilip_private.can_read('staff.access.inspect'))))
        or (a.purpose = 'profile' and (
          (a.uploader_id = (select auth.uid()) and (select mapsilip_private.tenant_active()))
          or mapsilip_private.can_read_tenant_photo(a.uploader_id)))
      )
    ));

commit;
