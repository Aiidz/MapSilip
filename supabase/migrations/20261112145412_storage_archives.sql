begin;

-- Extend the existing registry. No foreign keys or historical rows are removed.
alter table public.attachments
 add column legacy_upload boolean not null default true,
 add column bucket_name text not null default 'mapsilip_evidence' check(bucket_name='mapsilip_evidence'),
 add column original_name text check(length(original_name)<=240),
 add column checksum_sha256 text check(checksum_sha256 ~ '^[a-f0-9]{64}$'),
 add column lifecycle_status text not null default 'active' check(lifecycle_status in ('active','archive_pending','archived','deletion_pending','deleted')),
 add column retention_review_at date,
 add column reviewed_at timestamptz,
 add column review_decision text check(review_decision in ('retain','cleanup_review')),
 add column upload_state text not null default 'unknown' check(upload_state in ('unknown','uploaded','failed')),
 add column archived_at timestamptz,
 add column deleted_at timestamptz,
 add column deletion_authorized_by uuid references auth.users(id) on delete restrict,
 add column deletion_authorized_at timestamptz;
alter table public.attachments alter column legacy_upload set default false;
-- Existing attachments.path UNIQUE already prevents duplicate object registrations.
create index attachments_retention_due on public.attachments(retention_review_at) where lifecycle_status<>'deleted';

-- Key is deliberately inaccessible to application roles. Provision the matching server
-- environment value through an authorized administrator without logging it.
create table mapsilip_private.storage_receipt_key(singleton boolean primary key default true check(singleton), secret text not null, enforce_validated_uploads boolean not null default false);
insert into mapsilip_private.storage_receipt_key(singleton,secret) values(true,encode(extensions.gen_random_bytes(32),'hex'));
revoke all on mapsilip_private.storage_receipt_key from public,anon,authenticated,service_role;
create function mapsilip_private.storage_valid_receipt(message text,proof text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select proof is not null and proof=encode(extensions.hmac(message,secret,'sha256'),'hex') from mapsilip_private.storage_receipt_key where singleton),false);
$$;
revoke all on function mapsilip_private.storage_valid_receipt(text,text) from public,anon,authenticated,service_role;

create table public.storage_archives (
 id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id) on delete restrict,
 scope jsonb not null, state text not null default 'preparing' check(state in ('preparing','verified','failed')),
 record_count integer not null default 0, file_count integer not null default 0,
 downloaded_at timestamptz, safe_storage_confirmed_at timestamptz, verified_at timestamptz,
 created_at timestamptz not null default now(), error_code text
);
create table public.storage_archive_items (
 id bigint generated always as identity primary key,
 archive_id uuid not null references public.storage_archives(id) on delete restrict,
 kind text not null check(kind in ('record','file')), record_type text not null, record_id text not null,
 attachment_id uuid references public.attachments(id) on delete restrict,
 payload jsonb not null, checksum_sha256 text check(checksum_sha256 ~ '^[a-f0-9]{64}$'),
 delivered_at timestamptz, acknowledged_at timestamptz, error_code text,
 unique(archive_id,kind,record_type,record_id)
);
create index storage_archive_items_page on public.storage_archive_items(archive_id,id);
create table public.storage_events (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete restrict,
 attachment_id uuid references public.attachments(id) on delete restrict,
 archive_id uuid references public.storage_archives(id) on delete restrict,
 action text not null, detail text, created_at timestamptz not null default now()
);
create index storage_events_attachment_action on public.storage_events(attachment_id,action);
create table public.storage_record_reviews (
 id bigint generated always as identity primary key, record_type text not null, record_id uuid not null,
 retention_review_at date, decision text not null check(decision in ('retain','cleanup_review')),
 reviewed_by uuid not null references auth.users(id) on delete restrict, reviewed_at timestamptz not null default now(),
 unique(record_type,record_id)
);
alter table public.storage_record_reviews enable row level security;
revoke all on public.storage_record_reviews from public,anon,authenticated,service_role;
grant select on public.storage_record_reviews to authenticated;
create policy storage_record_reviews_owner on public.storage_record_reviews for select to authenticated using((select mapsilip_private.can_read('finance.read')));

create table public.storage_settings (
 singleton boolean primary key default true check(singleton), quota_bytes bigint check(quota_bytes>0),
 quota_source text check(length(quota_source) between 1 and 200),
 warning_percent integer not null default 70, review_percent integer not null default 85, critical_percent integer not null default 95,
 check(warning_percent>0 and warning_percent<review_percent and review_percent<critical_percent and critical_percent<=100),
 check((quota_bytes is null)=(quota_source is null))
);
insert into public.storage_settings(singleton) values(true);

alter table public.storage_archives enable row level security;
alter table public.storage_archive_items enable row level security;
alter table public.storage_events enable row level security;
alter table public.storage_settings enable row level security;
revoke all on public.storage_archives,public.storage_archive_items,public.storage_events,public.storage_settings from public,anon,authenticated,service_role;
grant select on public.storage_archives,public.storage_archive_items,public.storage_events,public.storage_settings to authenticated;
create policy storage_archives_owner on public.storage_archives for select to authenticated using((select mapsilip_private.can_read('finance.read')));
create policy storage_items_owner on public.storage_archive_items for select to authenticated using((select mapsilip_private.can_read('finance.read')));
create policy storage_events_owner on public.storage_events for select to authenticated using((select mapsilip_private.can_read('finance.read')));
create policy storage_settings_owner on public.storage_settings for select to authenticated using((select mapsilip_private.can_read('finance.read')));
create policy attachments_archive_owner_read on public.attachments for select to authenticated using((select mapsilip_private.can_read('finance.read')));
-- Owner inventory/download; tenant/caretaker policies retain their existing restrictions.
create policy storage_owner_inventory on storage.objects for select to authenticated using(bucket_id='mapsilip_evidence' and (select mapsilip_private.can_read('finance.read')));

-- Never allow a new business reference to an object being deleted or already deleted.
create function mapsilip_private.guard_archived_attachment() returns trigger language plpgsql security definer set search_path='' as $$
declare aid uuid; previous_id uuid; needs_file boolean:=true;
begin
 if tg_op='UPDATE' then if tg_table_name='room_assignments' then previous_id:=old.contract_attachment_id; else previous_id:=old.attachment_id; end if; end if;
 if tg_table_name='room_assignments' then aid:=new.contract_attachment_id;
 else aid:=new.attachment_id; end if;
 if (select enforce_validated_uploads from mapsilip_private.storage_receipt_key where singleton) and aid is not null and (tg_op='INSERT' or aid is distinct from previous_id) and exists(select 1 from public.attachments where id=aid and not legacy_upload and upload_state<>'uploaded') then raise exception 'trusted upload validation required' using errcode='23514'; end if;
 if aid is not null then perform 1 from public.attachments where id=aid for update; end if;
 if tg_op='UPDATE' and aid is not distinct from previous_id then
  if tg_table_name='room_assignments' then needs_file:=new.ended_on is null;
  elsif tg_table_name='maintenance_requests' then needs_file:=new.status<>'resolved';
  else needs_file:=new.status='pending'; end if;
 end if;
 if aid is not null and needs_file and exists(select 1 from public.attachments where id=aid and lifecycle_status in ('deletion_pending','deleted')) then
   raise exception 'attachment is archived and unavailable' using errcode='23514';
 end if;
 return new;
end; $$;
revoke all on function mapsilip_private.guard_archived_attachment() from public,anon,authenticated,service_role;
create trigger storage_payment_reference before insert or update on public.payments for each row execute function mapsilip_private.guard_archived_attachment();
create trigger storage_maintenance_reference before insert or update on public.maintenance_requests for each row execute function mapsilip_private.guard_archived_attachment();
create trigger storage_contract_reference before insert or update on public.room_assignments for each row execute function mapsilip_private.guard_archived_attachment();

-- Serialize reactivation against a cleanup claim for that tenant's related files.
create function mapsilip_private.guard_storage_reactivation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' and old.status is distinct from new.status then
  perform a.id from public.attachments a where a.uploader_id=new.user_id or a.id in(select attachment_id from public.payments where tenant_id=new.user_id union select contract_attachment_id from public.room_assignments where tenant_id=new.user_id) order by a.id for update;
  if exists(select 1 from public.attachments a where a.lifecycle_status='deletion_pending' and (a.uploader_id=new.user_id or a.id in(select attachment_id from public.payments where tenant_id=new.user_id union select contract_attachment_id from public.room_assignments where tenant_id=new.user_id))) then raise exception 'finish authorized file cleanup before reactivation' using errcode='23514'; end if;
 end if;
 return new;
end; $$;
revoke all on function mapsilip_private.guard_storage_reactivation() from public,anon,authenticated,service_role;
create trigger storage_tenant_reactivation before update on public.tenant_profiles for each row execute function mapsilip_private.guard_storage_reactivation();

create function mapsilip_private.storage_cleanup_blocker(aid uuid) returns text language plpgsql stable set search_path='' as $$
declare a public.attachments%rowtype; refs integer;
begin
 select * into a from public.attachments where id=aid;
 if not found then return 'unknown attachment'; end if;
 if exists(select 1 from pg_catalog.pg_constraint where contype='f' and confrelid='public.attachments'::regclass and conrelid not in ('public.payments'::regclass,'public.maintenance_requests'::regclass,'public.room_assignments'::regclass,'public.storage_archive_items'::regclass,'public.storage_events'::regclass)) then return 'unreviewed attachment dependency'; end if;
 select (select count(*) from public.payments where attachment_id=aid)+(select count(*) from public.maintenance_requests where attachment_id=aid)+(select count(*) from public.room_assignments where contract_attachment_id=aid) into refs;
 if refs>1 then return 'shared attachment'; end if;
 if refs=0 and a.purpose<>'profile' then return 'business record not identified'; end if;
 if a.purpose='profile' and not exists(select 1 from public.tenant_profiles where user_id=a.uploader_id and status='inactive') then return 'profile still needed or identity unknown'; end if;
 if exists(select 1 from public.tenant_profiles where user_id=a.uploader_id and status='active') then return 'active tenant'; end if;
 if exists(select 1 from public.payments p join public.tenant_profiles t on t.user_id=p.tenant_id where p.attachment_id=aid and (p.status='pending' or t.status='active')) then return 'active payment workflow'; end if;
 if exists(select 1 from public.maintenance_requests where attachment_id=aid and status<>'resolved') then return 'unresolved maintenance'; end if;
 if exists(select 1 from public.room_assignments where contract_attachment_id=aid and ended_on is null) then return 'active contract'; end if;
 if a.review_decision is distinct from 'cleanup_review' or a.reviewed_at is null then return 'retention review required'; end if;
 if not exists(select 1 from public.storage_archive_items i join public.storage_archives j on j.id=i.archive_id where i.attachment_id=aid and j.state='verified' and j.downloaded_at is not null and j.safe_storage_confirmed_at is not null and i.acknowledged_at is not null and i.checksum_sha256=a.checksum_sha256 and i.payload->>'path'=a.path) then return 'verified externally stored archive required'; end if;
 return null;
end; $$;
revoke all on function mapsilip_private.storage_cleanup_blocker(uuid) from public,anon,authenticated,service_role;

create function mapsilip_private.storage_manage(p_action text,p_data jsonb) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare aid uuid; jid uuid; asset public.attachments%rowtype; job public.storage_archives%rowtype;
 result jsonb; tbl text; predicate text; keyname text; scope_type text; target uuid; cursor_id bigint;
 blocker text; total bigint; quota bigint; n integer; level integer; item public.storage_archive_items%rowtype;
begin
 if auth.uid() is null or not mapsilip_private.can_read('finance.read') then raise exception 'not authorized' using errcode='42501'; end if;
 aid:=nullif(p_data->>'attachment_id','')::uuid; jid:=nullif(p_data->>'archive_id','')::uuid;
 if p_action='server.check' then
   if not mapsilip_private.storage_valid_receipt('server-check',p_data->>'proof') then raise exception 'server receipt configuration mismatch' using errcode='42501'; end if;
 elsif p_action='inventory' then
   select jsonb_build_object('measured_bytes',coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0),'object_count',count(*)) into result from storage.objects where bucket_id='mapsilip_evidence';
   return result || jsonb_build_object('settings',(select to_jsonb(s) from public.storage_settings s),
    'buckets',(select coalesce(jsonb_agg(to_jsonb(b)),'[]') from (select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='mapsilip_evidence')b),
    'categories',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from (select purpose,count(*) count,sum(byte_size) registered_bytes from public.attachments where lifecycle_status<>'deleted' group by purpose)c),
    'missing_count',(select count(*) from public.attachments a where lifecycle_status<>'deleted' and upload_state<>'failed' and not exists(select 1 from storage.objects o where o.bucket_id=a.bucket_name and o.name=a.path)),
    'orphan_count',(select count(*) from storage.objects o where o.bucket_id='mapsilip_evidence' and not exists(select 1 from public.attachments a where a.path=o.name and a.bucket_name=o.bucket_id)),
    'unlinked_count',(select count(*) from public.attachments a where a.purpose<>'profile' and a.lifecycle_status<>'deleted' and not exists(select 1 from public.payments where attachment_id=a.id) and not exists(select 1 from public.maintenance_requests where attachment_id=a.id) and not exists(select 1 from public.room_assignments where contract_attachment_id=a.id)),
    'failed_count',(select count(*) from public.attachments where upload_state='failed'));
 elsif p_action='files' then
   cursor_id:=coalesce((p_data->>'offset')::bigint,0); if cursor_id<0 or cursor_id>1000000 then raise exception 'invalid page'; end if;
   return jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
    select a.*, mapsilip_private.storage_cleanup_blocker(a.id) cleanup_blocker,
    exists(select 1 from storage.objects o where o.name=a.path and o.bucket_id=a.bucket_name) object_exists,
    (select coalesce(jsonb_agg(jsonb_build_object('type','payment','id',p.id)),'[]') from public.payments p where p.attachment_id=a.id) ||
    (select coalesce(jsonb_agg(jsonb_build_object('type','maintenance','id',m.id)),'[]') from public.maintenance_requests m where m.attachment_id=a.id) ||
    (select coalesce(jsonb_agg(jsonb_build_object('type','contract','id',r.id)),'[]') from public.room_assignments r where r.contract_attachment_id=a.id) associated_records
    from public.attachments a where coalesce(p_data->>'filter','all')='all' or (p_data->>'filter'='unlinked' and a.purpose<>'profile' and a.lifecycle_status<>'deleted' and not exists(select 1 from public.payments where attachment_id=a.id) and not exists(select 1 from public.maintenance_requests where attachment_id=a.id) and not exists(select 1 from public.room_assignments where contract_attachment_id=a.id)) or (p_data->>'filter'='failed' and a.upload_state='failed') or (p_data->>'filter'='review' and a.retention_review_at<=current_date+7 and a.lifecycle_status<>'deleted') or (p_data->>'filter'='missing' and a.lifecycle_status<>'deleted' and not exists(select 1 from storage.objects o where o.name=a.path and o.bucket_id=a.bucket_name)) order by case when p_data->>'sort'='largest' then a.byte_size end desc nulls last,a.created_at desc,a.id offset cursor_id limit 25)x));
 elsif p_action='orphans' then
   return jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
    select o.name object_path,coalesce((o.metadata->>'size')::bigint,0) size_bytes,o.created_at
    from storage.objects o where o.bucket_id='mapsilip_evidence' and not exists(select 1 from public.attachments a where a.path=o.name and a.bucket_name=o.bucket_id)
    order by o.name offset greatest(0,coalesce((p_data->>'offset')::integer,0)) limit 25)x));
 elsif p_action='history' then
   return jsonb_build_object('archives',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.storage_archives order by created_at desc offset greatest(0,coalesce((p_data->>'offset')::integer,0)) limit 25)x),
    'events',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.storage_events order by id desc limit 50)x));
 elsif p_action='settings' then
   update public.storage_settings set quota_bytes=nullif(p_data->>'quota_bytes','')::bigint,quota_source=nullif(p_data->>'quota_source',''),
    warning_percent=(p_data->>'warning_percent')::integer,review_percent=(p_data->>'review_percent')::integer,critical_percent=(p_data->>'critical_percent')::integer where singleton;
   insert into public.storage_events(actor_id,action,detail) values(auth.uid(),'settings.updated','Owner supplied quota/thresholds; quota is not provider verified');
 elsif p_action='records.reviews' then
   return jsonb_build_object('rows',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
    select r.*,exists(select 1 from public.storage_archive_items i join public.storage_archives j on j.id=i.archive_id where i.kind='record' and i.record_type=r.record_type and i.record_id=r.record_id::text and j.state='verified') archived
    from public.storage_record_reviews r order by r.retention_review_at nulls last,r.id offset greatest(0,coalesce((p_data->>'offset')::integer,0)) limit 25)x));
 elsif p_action='review.record' then
   tbl:=p_data->>'record_type'; target:=(p_data->>'record_id')::uuid;
   if tbl is null or tbl not in ('tenant_profiles','room_assignments','invoices','payments','maintenance_requests','concerns','account_requests') or p_data->>'decision' is null or p_data->>'decision' not in ('retain','cleanup_review') then raise exception 'invalid record review'; end if;
   execute format('select count(*) from public.%I where %I=$1',tbl,case when tbl='tenant_profiles' then 'user_id' else 'id' end) into n using target;
   if n<>1 then raise exception 'record unavailable'; end if;
   insert into public.storage_record_reviews(record_type,record_id,retention_review_at,decision,reviewed_by)
    values(tbl,target,nullif(p_data->>'review_at','')::date,p_data->>'decision',auth.uid())
    on conflict(record_type,record_id) do update set retention_review_at=excluded.retention_review_at,decision=excluded.decision,reviewed_by=excluded.reviewed_by,reviewed_at=now();
   insert into public.storage_events(actor_id,action,detail) values(auth.uid(),'retention.record_review',tbl||':'||target::text);
 elsif p_action='review' then
   if p_data->>'decision' is null or p_data->>'decision' not in ('retain','cleanup_review') then raise exception 'invalid decision'; end if;
   update public.attachments set retention_review_at=nullif(p_data->>'review_at','')::date,reviewed_at=now(),review_decision=p_data->>'decision' where id=aid and lifecycle_status not in ('deletion_pending','deleted');
   if not found then raise exception 'attachment unavailable'; end if;
   insert into public.storage_events(actor_id,attachment_id,action,detail) values(auth.uid(),aid,'retention.review',p_data->>'decision');
 elsif p_action='archive.create' then
   scope_type:=p_data->>'type'; target:=nullif(p_data->>'target_id','')::uuid;
   if scope_type is null or scope_type not in ('tenant','room','range','selected','full') or (scope_type in ('tenant','room') and target is null) then raise exception 'invalid scope'; end if;
   if scope_type='tenant' and not exists(select 1 from public.tenant_profiles where user_id=target) then raise exception 'tenant unavailable'; end if;
   if scope_type='room' and not exists(select 1 from public.rooms where id=target) then raise exception 'room unavailable'; end if;
   if scope_type='full' and exists(select 1 from storage.objects o where o.bucket_id='mapsilip_evidence' and not exists(select 1 from public.attachments a where a.path=o.name and a.bucket_name=o.bucket_id)) then raise exception 'unregistered objects require classification before a full archive' using errcode='23514'; end if;
   if scope_type='selected' and (jsonb_typeof(p_data->'ids')<>'array' or jsonb_array_length(p_data->'ids') not between 1 and 100) then raise exception 'select 1 to 100 record IDs'; end if;
   if scope_type='range' and (nullif(p_data->>'from','') is null or nullif(p_data->>'to','') is null or (p_data->>'from')::date>(p_data->>'to')::date) then raise exception 'date range required'; end if;
   if (select count(*) from public.storage_archives where state='preparing')>=3 then raise exception 'finish or fail an existing archive first'; end if;
   -- Short, bounded snapshot transaction. Fail fast if a business writer is active.
   lock table public.tenant_profiles,public.rooms,public.room_assignments,public.invoices,public.payments,public.maintenance_requests,public.concerns,public.planned_visits,public.operational_audit,public.account_requests,public.attachments in share mode nowait;
   insert into public.storage_archives(created_by,scope) values(auth.uid(),p_data) returning * into job;
   jid:=job.id;
   -- Fixed allowlist only. Sensitive Auth/session and invitation credentials are never exported.
   foreach tbl in array array['tenant_profiles','rooms','room_assignments','invoices','payments','maintenance_requests','concerns','planned_visits','operational_audit','account_requests'] loop
     keyname:=case when tbl='tenant_profiles' then 'user_id' else 'id' end;
     predicate:='true';
     if scope_type='room' then
       predicate:=case when tbl='rooms' then format('t.id=%L::uuid',target) when tbl='maintenance_requests' then format('t.room_id=%L::uuid',target) else 'false' end;
     elsif scope_type='tenant' then
       predicate:=case when tbl='tenant_profiles' then format('t.user_id=%L::uuid',target)
         when tbl='rooms' then format('t.id in (select room_id from public.room_assignments where tenant_id=%L::uuid)',target)
         when tbl='account_requests' then format('t.activated_user_id=%L::uuid',target)
         when tbl='operational_audit' then format('t.record_id=%L::uuid',target)
         else format('t.tenant_id=%L::uuid',target) end;
     elsif scope_type='range' then predicate:=format('t.created_at >= %L::date and t.created_at < (%L::date+1)',p_data->>'from',p_data->>'to');
     elsif scope_type='selected' then predicate:=format('t.%I::text in (select jsonb_array_elements_text(%L::jsonb))',keyname,p_data->'ids'); end if;
     execute format('insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload) select $1,''record'',%L,t.%I::text,to_jsonb(t)-''invitation_hash'' from public.%I t where %s limit 25001',tbl,keyname,tbl,predicate) using jid;
     if (select count(*) from public.storage_archive_items where archive_id=jid)>25000 then raise exception 'archive exceeds 25000-record safety limit; partition by date or selection'; end if;
   end loop;
   if scope_type='selected' and exists(select 1 from jsonb_array_elements_text(p_data->'ids') v(id) where not exists(select 1 from public.storage_archive_items i where i.archive_id=jid and i.record_id=v.id)) then raise exception 'one or more selected record IDs are unavailable'; end if;
   if scope_type in ('range','selected') then
    insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload)
     select jid,'record','invoices',t.id::text,to_jsonb(t) from public.invoices t where t.id::text in(select payload->>'invoice_id' from public.storage_archive_items where archive_id=jid and record_type='payments') on conflict do nothing;
    insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload)
     select jid,'record','tenant_profiles',t.user_id::text,to_jsonb(t) from public.tenant_profiles t where t.user_id::text in(select payload->>'tenant_id' from public.storage_archive_items where archive_id=jid) on conflict do nothing;
    insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload)
     select jid,'record','rooms',t.id::text,to_jsonb(t) from public.rooms t where t.id::text in(select payload->>'room_id' from public.storage_archive_items where archive_id=jid) on conflict do nothing;
   end if;
   if (select count(*) from public.storage_archive_items where archive_id=jid and kind='record')>25000 then raise exception 'archive record safety limit exceeded after related-record expansion'; end if;
   -- Contact email only: never serialize Auth rows, passwords, tokens or metadata.
   insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload)
    select jid,'record','tenant_contact',u.id::text,jsonb_build_object('user_id',u.id,'email',u.email) from auth.users u where exists(select 1 from public.storage_archive_items i where i.archive_id=jid and i.record_type='tenant_profiles' and i.record_id=u.id::text);
   insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload)
    select jid,'record','operational_audit',a.id::text,to_jsonb(a) from public.operational_audit a where exists(select 1 from public.storage_archive_items i where i.archive_id=jid and i.kind='record' and i.record_type<>'operational_audit' and i.record_id=a.record_id::text) on conflict do nothing;
   -- Room histories retain reporter attribution without exporting unrelated tenant details.
   if scope_type='room' then
    insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload)
     select distinct jid,'record','reporters',t.user_id::text,jsonb_build_object('user_id',t.user_id,'display_name',t.display_name)
     from public.tenant_profiles t join public.maintenance_requests m on m.tenant_id=t.user_id where m.room_id=target;
   end if;
   insert into public.storage_archive_items(archive_id,kind,record_type,record_id,attachment_id,payload)
    select jid,'file','attachments',a.id::text,a.id,to_jsonb(a) from public.attachments a where
     a.id::text in (select payload->>'attachment_id' from public.storage_archive_items where archive_id=jid and kind='record' union select payload->>'contract_attachment_id' from public.storage_archive_items where archive_id=jid and kind='record')
     or (scope_type='tenant' and a.uploader_id=target and a.purpose='profile') or scope_type='full';
   insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload)
    select jid,'record','storage_events',e.id::text,to_jsonb(e) from public.storage_events e where scope_type='full' or e.attachment_id in(select attachment_id from public.storage_archive_items where archive_id=jid and kind='file');
   insert into public.storage_archive_items(archive_id,kind,record_type,record_id,payload)
    select jid,'record','storage_record_reviews',r.id::text,to_jsonb(r) from public.storage_record_reviews r where scope_type='full' or exists(select 1 from public.storage_archive_items i where i.archive_id=jid and i.kind='record' and i.record_type=r.record_type and i.record_id=r.record_id::text);
   if (select count(*) from public.storage_archive_items where archive_id=jid and kind='record')>25000 then raise exception 'archive safety limit exceeded including audit records'; end if;
   if (select count(*) from public.storage_archive_items where archive_id=jid and kind='file')>25000 then raise exception 'archive exceeds file safety limit; partition by tenant or date'; end if;
   update public.storage_archives set record_count=(select count(*) from public.storage_archive_items where archive_id=jid and kind='record'),file_count=(select count(*) from public.storage_archive_items where archive_id=jid and kind='file') where id=jid;
   update public.attachments set lifecycle_status='archive_pending' where lifecycle_status='active' and id in(select attachment_id from public.storage_archive_items where archive_id=jid);
   insert into public.storage_events(actor_id,archive_id,action) values(auth.uid(),jid,'archive.created');
   return jsonb_build_object('id',jid);
 elsif p_action='archive.items' then
   return jsonb_build_object('archive',(select to_jsonb(j) from public.storage_archives j where id=jid),
    'items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.storage_archive_items where archive_id=jid and id>coalesce((p_data->>'cursor')::bigint,0) order by id limit 25)x));
 elsif p_action='archive.file' then
   select * into item from public.storage_archive_items where archive_id=jid and id=(p_data->>'item_id')::bigint and kind='file';
   if not found then raise exception 'file unavailable'; end if;
   select * into asset from public.attachments where id=item.attachment_id;
   if asset.lifecycle_status in ('deletion_pending','deleted') or asset.path is distinct from item.payload->>'path' then raise exception 'source unavailable'; end if;
   return to_jsonb(item);
 elsif p_action='archive.retry' then
   update public.storage_archives set state='preparing',error_code=null where id=jid and state='failed';
   if not found then raise exception 'archive cannot be retried'; end if;
   update public.storage_archive_items set acknowledged_at=null,error_code=null where archive_id=jid;
 elsif p_action='archive.item_failed' then
   update public.storage_archive_items set error_code='missing_unreadable_or_changed',acknowledged_at=null where archive_id=jid and id=(p_data->>'item_id')::bigint;
   update public.storage_archives set state='failed',error_code='attachment_incomplete' where id=jid and state='preparing';
   insert into public.storage_events(actor_id,archive_id,action,detail) values(auth.uid(),jid,'archive.file_failed','Missing, unreadable, changed or size-mismatched source; no originals removed');
 elsif p_action='archive.records_delivered' then
   if jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items')>25 then raise exception 'invalid record batch'; end if;
   for result in select value from jsonb_array_elements(p_data->'items') loop
     if not mapsilip_private.storage_valid_receipt('archive.records_delivered|'||jid::text||'|'||(result->>'id')||'|'||(result->>'checksum'),result->>'proof') then raise exception 'trusted receipt required' using errcode='42501'; end if;
     if result->>'checksum' !~ '^[a-f0-9]{64}$' then raise exception 'invalid checksum'; end if;
     update public.storage_archive_items set checksum_sha256=result->>'checksum',delivered_at=now(),error_code=null where archive_id=jid and id=(result->>'id')::bigint and kind='record';
     if not found then raise exception 'record unavailable'; end if;
   end loop;
 elsif p_action='archive.delivered' then
   if not mapsilip_private.storage_valid_receipt('archive.delivered|'||jid::text||'|'||(p_data->>'item_id')||'|'||(p_data->>'checksum'),p_data->>'proof') then raise exception 'trusted receipt required' using errcode='42501'; end if;
   if p_data->>'checksum' !~ '^[a-f0-9]{64}$' then raise exception 'invalid checksum'; end if;
   update public.storage_archive_items set checksum_sha256=p_data->>'checksum',delivered_at=now(),error_code=null where archive_id=jid and id=(p_data->>'item_id')::bigint;
   if not found then raise exception 'item unavailable'; end if;
 elsif p_action='archive.ack' then
   update public.storage_archive_items set acknowledged_at=now() where archive_id=jid and id=(p_data->>'item_id')::bigint and delivered_at is not null and checksum_sha256=p_data->>'checksum';
   if not found then raise exception 'checksum acknowledgement mismatch'; end if;
 elsif p_action='archive.failed' then
   update public.storage_archives set state='failed',error_code='export_failed' where id=jid and state='preparing';
   insert into public.storage_events(actor_id,archive_id,action,detail) values(auth.uid(),jid,'archive.failed','Export incomplete; originals retained');
 elsif p_action='archive.confirm' then
   select * into job from public.storage_archives where id=jid for update;
   if not found or job.state<>'preparing' or p_data->>'confirmation'<>'DOWNLOADED AND SAFELY STORED' then raise exception 'confirmation required'; end if;
   if exists(select 1 from public.storage_archive_items where archive_id=jid and (acknowledged_at is null or error_code is not null)) then raise exception 'archive incomplete'; end if;
   if job.record_count<>(select count(*) from public.storage_archive_items where archive_id=jid and kind='record') or job.file_count<>(select count(*) from public.storage_archive_items where archive_id=jid and kind='file') then raise exception 'manifest counts differ'; end if;
   update public.storage_archives set state='verified',downloaded_at=now(),safe_storage_confirmed_at=now(),verified_at=now() where id=jid;
   update public.attachments a set lifecycle_status='archived',archived_at=now(),checksum_sha256=i.checksum_sha256 from public.storage_archive_items i where i.archive_id=jid and i.attachment_id=a.id and a.lifecycle_status in ('active','archive_pending','archived');
   insert into public.storage_events(actor_id,archive_id,action) values(auth.uid(),jid,'archive.external_storage_confirmed');
 elsif p_action='cleanup.claim' then
   select * into asset from public.attachments where id=aid for update;
   if not found or p_data->>'confirmation' is distinct from aid::text then raise exception 'explicit file confirmation required'; end if;
   if asset.lifecycle_status='deleted' then return jsonb_build_object('deleted',true); end if;
   blocker:=mapsilip_private.storage_cleanup_blocker(aid); if blocker is not null then raise exception '%',blocker using errcode='23514'; end if;
   update public.attachments set lifecycle_status='deletion_pending',deletion_authorized_by=auth.uid(),deletion_authorized_at=now() where id=aid;
   insert into public.storage_events(actor_id,attachment_id,action) values(auth.uid(),aid,'cleanup.authorized');
   return jsonb_build_object('bucket',asset.bucket_name,'path',asset.path);
 elsif p_action='cleanup.finished' then
   if exists(select 1 from public.attachments a join storage.objects o on o.name=a.path and o.bucket_id=a.bucket_name where a.id=aid) then raise exception 'Storage object still exists'; end if;
   update public.attachments set lifecycle_status='deleted',deleted_at=now() where id=aid and lifecycle_status='deletion_pending' and deletion_authorized_by=auth.uid();
   if not found then raise exception 'no authorized deletion'; end if;
   insert into public.storage_events(actor_id,attachment_id,action,detail) values(auth.uid(),aid,'cleanup.deleted','Storage API success and absence confirmed; an idempotent retry may find the object already absent');
 elsif p_action='cleanup.cancel' then
   update public.attachments a set lifecycle_status='archived',deletion_authorized_by=null,deletion_authorized_at=null where a.id=aid and a.lifecycle_status='deletion_pending' and exists(select 1 from storage.objects o where o.name=a.path and o.bucket_id=a.bucket_name);
   if not found then raise exception 'cancellation requires the original object still to exist'; end if;
   insert into public.storage_events(actor_id,attachment_id,action) values(auth.uid(),aid,'cleanup.cancelled');
 elsif p_action='cleanup.failed' then
   insert into public.storage_events(actor_id,attachment_id,action,detail) values(auth.uid(),aid,'cleanup.failed','Storage removal failed or could not be confirmed; retry remains owner authorized');
 elsif p_action='remind' then
   insert into public.notifications(recipient_id,title,body,href,event_key)
    select a.user_id,'Storage retention review','Files need owner review. Review dates never authorize deletion.','/management/storage','storage-review:'||current_date::text||':'||a.user_id::text
    from mapsilip_private.accounts a where a.role='owner' and a.status='active' and (exists(select 1 from public.attachments where retention_review_at<=current_date+7 and lifecycle_status<>'deleted') or exists(select 1 from public.storage_record_reviews where retention_review_at<=current_date+7)) on conflict(event_key) do nothing;
   insert into public.notifications(recipient_id,title,body,href,event_key)
    select a.user_id,'Storage archive review','An inactive tenant has files without a verified archive, or an archive/upload needs review.','/management/storage','storage-archive:'||current_date::text||':'||a.user_id::text
    from mapsilip_private.accounts a where a.role='owner' and a.status='active' and (
     exists(select 1 from public.attachments f join public.tenant_profiles t on t.user_id=f.uploader_id where t.status='inactive' and f.lifecycle_status in ('active','archive_pending')) or
     exists(select 1 from public.storage_archives where state='failed') or exists(select 1 from public.attachments where upload_state='failed') or
     exists(select 1 from storage.objects o where o.bucket_id='mapsilip_evidence' and not exists(select 1 from public.attachments f where f.path=o.name and f.bucket_name=o.bucket_id))) on conflict(event_key) do nothing;
   select coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) into total from storage.objects where bucket_id='mapsilip_evidence';
   select quota_bytes,case when total*100.0/quota_bytes>=critical_percent then critical_percent when total*100.0/quota_bytes>=review_percent then review_percent when total*100.0/quota_bytes>=warning_percent then warning_percent end into quota,level from public.storage_settings where singleton;
   if level is not null then insert into public.notifications(recipient_id,title,body,href,event_key) select a.user_id,'Storage usage review','Measured usage reached a configured warning threshold. Review archives; no files are deleted automatically.','/management/storage','storage-usage:'||current_date::text||':'||level::text||':'||a.user_id::text from mapsilip_private.accounts a where a.role='owner' and a.status='active' on conflict(event_key) do nothing; end if;
 else raise exception 'unsupported storage action' using errcode='22023'; end if;
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function mapsilip_private.storage_manage(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.storage_manage(text,jsonb) to authenticated;
create function public.mapsilip_storage_manage(p_action text,p_data jsonb default '{}') returns jsonb language sql volatile security invoker set search_path='' as $$select mapsilip_private.storage_manage(p_action,p_data);$$;
revoke all on function public.mapsilip_storage_manage(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.mapsilip_storage_manage(text,jsonb) to authenticated;

-- Upload finalization is uploader-scoped and cannot mutate archive/retention state.
create function mapsilip_private.storage_upload_result(p_id uuid,p_name text,p_checksum text,p_success boolean,p_proof text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (mapsilip_private.tenant_active() or mapsilip_private.can_read('staff.access.inspect')) then raise exception 'not authorized' using errcode='42501'; end if;
 if not mapsilip_private.storage_valid_receipt('upload|'||p_id::text||'|'||coalesce(p_name,'')||'|'||coalesce(p_checksum,'')||'|'||p_success::text,p_proof) then raise exception 'trusted receipt required' using errcode='42501'; end if;
 if p_success and (p_checksum is null or p_checksum !~ '^[a-f0-9]{64}$') then raise exception 'invalid checksum'; end if;
 update public.attachments set original_name=left(p_name,240),checksum_sha256=case when p_success then p_checksum else null end,upload_state=case when p_success then 'uploaded' else 'failed' end
 where id=p_id and uploader_id=auth.uid() and lifecycle_status='active' and upload_state='unknown';
 if not found then raise exception 'upload cannot be finalized'; end if;
 insert into public.storage_events(actor_id,attachment_id,action) values(auth.uid(),p_id,case when p_success then 'upload.completed' else 'upload.failed' end);
end; $$;
revoke all on function mapsilip_private.storage_upload_result(uuid,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.storage_upload_result(uuid,text,text,boolean,text) to authenticated;
create function public.mapsilip_storage_upload_result(p_id uuid,p_name text,p_checksum text,p_success boolean,p_proof text) returns void language sql security invoker set search_path='' as $$select mapsilip_private.storage_upload_result(p_id,p_name,p_checksum,p_success,p_proof);$$;
revoke all on function public.mapsilip_storage_upload_result(uuid,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.mapsilip_storage_upload_result(uuid,text,text,boolean,text) to authenticated;

-- Log a failed link without deleting evidence; an attachment owner can only report their own unused upload.
create function mapsilip_private.storage_link_failure(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not (mapsilip_private.tenant_active() or mapsilip_private.can_read('staff.access.inspect')) or not exists(select 1 from public.attachments where id=p_id and uploader_id=auth.uid()) then raise exception 'not authorized' using errcode='42501'; end if;
 if exists(select 1 from public.payments where attachment_id=p_id) or exists(select 1 from public.maintenance_requests where attachment_id=p_id) or exists(select 1 from public.room_assignments where contract_attachment_id=p_id) then return; end if;
 insert into public.storage_events(actor_id,attachment_id,action,detail)
  select auth.uid(),p_id,'business.link_failed','Uploaded evidence retained for owner review; no cleanup authorized' where not exists(select 1 from public.storage_events where attachment_id=p_id and action='business.link_failed');
end; $$;
revoke all on function mapsilip_private.storage_link_failure(uuid) from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.storage_link_failure(uuid) to authenticated;
create function public.mapsilip_storage_link_failure(p_id uuid) returns void language sql security invoker set search_path='' as $$select mapsilip_private.storage_link_failure(p_id);$$;
revoke all on function public.mapsilip_storage_link_failure(uuid) from public,anon,authenticated,service_role;
grant execute on function public.mapsilip_storage_link_failure(uuid) to authenticated;

create policy storage_owner_authorized_cleanup on storage.objects for delete to authenticated using(bucket_id='mapsilip_evidence' and (select mapsilip_private.can_read('finance.read')) and exists(select 1 from public.attachments a where a.path=objects.name and a.bucket_name=objects.bucket_id and a.lifecycle_status='deletion_pending' and a.deletion_authorized_by=(select auth.uid())));
-- Coordinate enforcement with the new upload code's deployment. Only an administrator
-- can activate this; installing the schema alone must not break the previous release.
create function mapsilip_private.activate_storage_controls() returns void language plpgsql security invoker set search_path='' as $$
begin
 update mapsilip_private.storage_receipt_key set enforce_validated_uploads=true where singleton;
 drop policy if exists unused_contract_delete on storage.objects;
 revoke execute on function public.mapsilip_claim_contract_discard(uuid),public.mapsilip_discard_contract(uuid),mapsilip_private.claim_contract_discard(uuid),mapsilip_private.discard_contract(uuid) from authenticated;
end; $$;
revoke all on function mapsilip_private.activate_storage_controls() from public,anon,authenticated,service_role;

-- Permit original PDFs through the existing guarded contract review transaction.
do $migration$
declare definition text;
begin
 definition:=pg_get_functiondef('mapsilip_private.review_account_contract(uuid,text,uuid,date,text,uuid,date)'::regprocedure);
 if position('mime_type in (''image/jpeg'',''image/png'')' in definition)=0 then raise exception 'contract review differs from expected definition'; end if;
 execute replace(definition,'mime_type in (''image/jpeg'',''image/png'')','mime_type in (''image/jpeg'',''image/png'',''application/pdf'')');
end; $migration$;
commit;
