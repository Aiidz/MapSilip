begin;
create policy attachments_staff_profile_read on public.attachments for select to authenticated
 using(purpose='profile' and (select mapsilip_private.can_read('staff.access.inspect')));
create policy staff_profile_image_download on storage.objects for select to authenticated
 using(bucket_id='mapsilip_evidence'
 and storage.allow_any_operation(array['object.get_authenticated_info','object.get_authenticated']::text[])
 and (select mapsilip_private.can_read('staff.access.inspect'))
 and exists(select 1 from public.attachments a where a.path=objects.name and a.purpose='profile' and a.mime_type in ('image/jpeg','image/png')));
commit;
