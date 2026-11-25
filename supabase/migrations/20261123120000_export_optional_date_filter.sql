begin;

create or replace function mapsilip_private.storage_create_category_archive(p_scope jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  category text := p_scope->>'category';
  scope_type text := p_scope->>'type';
  target_id uuid := nullif(p_scope->>'target_id', '')::uuid;
  from_day date := nullif(p_scope->>'from', '')::date;
  through_day date := nullif(p_scope->>'to', '')::date;
  archive_uuid uuid;
  records integer;
  originals integer;
begin
  if auth.uid() is null or not mapsilip_private.can_read('finance.read') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if category is null or category not in ('all','payments','rooms','maintenance','concerns','tenants')
     or scope_type is null or scope_type not in ('full','tenant','room','range')
     or (scope_type in ('tenant','room') and target_id is null)
     or (scope_type = 'range' and (from_day is null or through_day is null or from_day > through_day))
     or (from_day is not null and through_day is not null and from_day > through_day) then
    raise exception 'invalid export scope' using errcode = '22023';
  end if;
  if scope_type = 'tenant' and not exists(select 1 from public.tenant_profiles where user_id = target_id)
     or scope_type = 'room' and not exists(select 1 from public.rooms where id = target_id) then
    raise exception 'export target unavailable' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mapsilip-category-export', 0));
  if (select count(*) from public.storage_archives where state = 'preparing') >= 3 then
    raise exception 'finish an existing export first' using errcode = '23514';
  end if;

  insert into public.storage_archives(created_by, scope) values(auth.uid(), p_scope)
    returning id into archive_uuid;
  -- One statement freezes the selected records and their original-file metadata.
  with candidates as (
    select 'invoices' kind, i.id, i.tenant_id, i.room_id, i.created_at, to_jsonb(i) payload, null::uuid attachment_id
      from public.invoices i where category in ('all','payments')
    union all
    select 'payments', p.id, p.tenant_id, i.room_id, p.created_at, to_jsonb(p) - 'reviewer_id', p.attachment_id
      from public.payments p join public.invoices i on i.id = p.invoice_id where category in ('all','payments')
    union all
    select 'rooms', r.id, null, r.id, r.created_at, to_jsonb(r), null
      from public.rooms r where category in ('all','rooms')
    union all
    select 'room_assignments', a.id, a.tenant_id, a.room_id, a.created_at, to_jsonb(a), a.contract_attachment_id
      from public.room_assignments a where category in ('all','rooms','tenants')
    union all
    select 'maintenance_requests', m.id, m.tenant_id, m.room_id, m.created_at, to_jsonb(m), m.attachment_id
      from public.maintenance_requests m where category in ('all','maintenance')
    union all
    select 'concerns', c.id, c.tenant_id, null, c.created_at, to_jsonb(c), null
      from public.concerns c where category in ('all','concerns')
    union all
    select 'tenant_profiles', t.user_id, t.user_id, null, t.created_at, to_jsonb(t), null
      from public.tenant_profiles t where category in ('all','tenants')
  ), chosen as materialized (
    select c.* from candidates c
    where case scope_type
      when 'full' then true
      when 'range' then c.created_at >= (from_day::timestamp at time zone 'Asia/Manila')
        and c.created_at < ((through_day + 1)::timestamp at time zone 'Asia/Manila')
      when 'tenant' then c.tenant_id = target_id or (c.kind = 'rooms' and exists (
        select 1 from public.room_assignments a where a.tenant_id = target_id and a.room_id = c.room_id))
      when 'room' then c.room_id = target_id or (c.room_id is null and exists (
        select 1 from public.room_assignments a where a.room_id = target_id and a.tenant_id = c.tenant_id
          and (c.kind = 'tenant_profiles' or (c.created_at at time zone 'Asia/Manila')::date
            between a.started_on and coalesce(a.ended_on, 'infinity'::date))))
    end
    and (scope_type = 'range' or from_day is null or c.created_at >= (from_day::timestamp at time zone 'Asia/Manila'))
    and (scope_type = 'range' or through_day is null or c.created_at < ((through_day + 1)::timestamp at time zone 'Asia/Manila'))
    order by c.kind, c.id limit 25001
  ), original_ids as (
    select distinct attachment_id from chosen where attachment_id is not null
  )
  insert into public.storage_archive_items(archive_id, kind, record_type, record_id, attachment_id, payload)
    select archive_uuid, 'record', kind, id::text, null, payload from chosen
    union all
    select archive_uuid, 'file', 'attachments', a.id::text, a.id, to_jsonb(a)
      from original_ids o join public.attachments a on a.id = o.attachment_id;
  select count(*) filter (where kind = 'record'), count(*) filter (where kind = 'file')
    into records, originals from public.storage_archive_items where archive_id = archive_uuid;
  if records > 25000 or originals > 25000 then
    raise exception 'narrow the export scope' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.storage_archive_items r
    where r.archive_id = archive_uuid and r.kind = 'record'
      and coalesce(r.payload->>'attachment_id', r.payload->>'contract_attachment_id') is not null
      and not exists (select 1 from public.storage_archive_items f where f.archive_id = archive_uuid and f.kind = 'file'
        and f.record_id = coalesce(r.payload->>'attachment_id', r.payload->>'contract_attachment_id'))
  ) then raise exception 'required original metadata unavailable' using errcode = '23514'; end if;
  update public.storage_archives set record_count = records, file_count = originals where id = archive_uuid;
  insert into public.storage_events(actor_id, archive_id, action) values(auth.uid(), archive_uuid, 'archive.created');
  return jsonb_build_object('id', archive_uuid);
end;
$$;

commit;
