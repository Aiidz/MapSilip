-- The Storage SDK requests object metadata before downloading private files.
-- Keep access limited to the existing attachment ownership and role checks.
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
        or (a.purpose = 'profile' and a.uploader_id = (select auth.uid())
          and ((select mapsilip_private.tenant_active())
            or (select mapsilip_private.can_read('staff.access.inspect'))))
      )
    ));
