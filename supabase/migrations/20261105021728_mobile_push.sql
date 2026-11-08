-- Local review candidate. Hosted application requires separate authorization.
begin;

create table mapsilip_private.push_runtime (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into mapsilip_private.push_runtime(singleton) values(true);
create table mapsilip_private.push_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  categories jsonb not null default '{"payments":true,"maintenance":true,"accounts":true,"visitors":true,"concerns":false}',
  initialized_at timestamptz, updated_at timestamptz not null default now()
);
create table mapsilip_private.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  auth_session_id uuid not null, staff_security_revision bigint,
  bound_at timestamptz not null default now(),
  installation_hash text not null check(installation_hash ~ '^[0-9a-f]{64}$'),
  endpoint text not null unique check(length(endpoint)<=4096), endpoint_hash text not null unique,
  p256dh text not null, auth text not null, generation uuid not null default gen_random_uuid(),
  enabled boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), disabled_at timestamptz
);
create index push_subscriptions_user_session on mapsilip_private.push_subscriptions(user_id,auth_session_id) where enabled;
create unique index push_subscriptions_one_active_installation on mapsilip_private.push_subscriptions(installation_hash) where enabled;
create index push_subscriptions_user_cursor on mapsilip_private.push_subscriptions(user_id,id);
create table mapsilip_private.push_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade, kind text not null,
  window_at timestamptz not null, attempts integer not null check(attempts>0),
  primary key(user_id,kind,window_at)
);
create index push_rate_limits_window on mapsilip_private.push_rate_limits(window_at);
create table mapsilip_private.push_outbox (
  id uuid primary key default gen_random_uuid(), notification_id uuid not null unique references public.notifications(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  category text not null check(category in('payments','maintenance','accounts','visitors','concerns')),
  created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index push_outbox_created on mapsilip_private.push_outbox(created_at);
create table mapsilip_private.push_deliveries (
  id uuid primary key default gen_random_uuid(), outbox_id uuid not null references mapsilip_private.push_outbox(id) on delete cascade,
  subscription_id uuid not null references mapsilip_private.push_subscriptions(id) on delete cascade,
  subscription_generation uuid not null,
  status text not null default 'pending' check(status in('pending','leased','accepted','discarded','failed')),
  attempts integer not null default 0 check(attempts>=0), attempt_reserved boolean not null default false, next_attempt_at timestamptz not null default now(),
  lease_until timestamptz, claim_token uuid, provider_status integer, finished_at timestamptz,
  unique(outbox_id,subscription_id)
);
create index push_deliveries_due on mapsilip_private.push_deliveries(next_attempt_at) where status='pending';
create index push_deliveries_leases on mapsilip_private.push_deliveries(lease_until) where status='leased';

alter table mapsilip_private.push_runtime enable row level security;
alter table mapsilip_private.push_preferences enable row level security;
alter table mapsilip_private.push_subscriptions enable row level security;
alter table mapsilip_private.push_rate_limits enable row level security;
alter table mapsilip_private.push_outbox enable row level security;
alter table mapsilip_private.push_deliveries enable row level security;
revoke all on mapsilip_private.push_runtime,mapsilip_private.push_preferences,mapsilip_private.push_subscriptions,
  mapsilip_private.push_rate_limits,mapsilip_private.push_outbox,mapsilip_private.push_deliveries from public,anon,authenticated,service_role,mapsilip_security_executor;

create function mapsilip_private.push_is_enabled() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select enabled from mapsilip_private.push_runtime where singleton),false)
$$;
revoke all on function mapsilip_private.push_is_enabled() from public,anon,authenticated,service_role,mapsilip_security_executor;

create function mapsilip_private.push_authorize() returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if not mapsilip_private.push_is_enabled() then
    raise exception 'push unavailable' using errcode='55000';
  end if;
  -- Same live-session, staff-admission and tenant-role authority as business operations.
  perform mapsilip_private.operational_role();
  return uid;
end $$;
create function mapsilip_private.push_rate(kind_value text, maximum integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  insert into mapsilip_private.push_rate_limits(user_id,kind,window_at,attempts)
    values(auth.uid(),kind_value,to_timestamp(floor(extract(epoch from now())/600)*600),1)
    on conflict(user_id,kind,window_at) do update set attempts=least(push_rate_limits.attempts+1,maximum+1) returning attempts into n;
  return n<=maximum;
end $$;
-- Return errors instead of aborting the RPC, so failed attempts commit their quota.
create function mapsilip_private.push_attempt(p_kind text) returns text
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); maximum integer;
begin
 if not mapsilip_private.push_is_enabled() then return '55000'; end if;
 if uid is null or not exists(select 1 from auth.users where id=uid) then return '42501'; end if;
 if p_kind='subscription' then maximum:=10; elsif p_kind='preferences' then maximum:=30;
 else return '22023'; end if;
 if not mapsilip_private.push_rate(p_kind,maximum) then return 'P0429'; end if;
 return null;
end $$;
-- Used only to account for failures rejected by server parsing/authority preflight.
create function public.mapsilip_push_record_rejection(p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rejection text;
begin
 rejection:=mapsilip_private.push_attempt(p_kind);
 if rejection is not null then return jsonb_build_object('push_error',rejection); end if;
 return jsonb_build_object('recorded',true);
end $$;
revoke all on function mapsilip_private.push_attempt(text),public.mapsilip_push_record_rejection(text)
 from public,anon,authenticated,service_role,mapsilip_security_executor;
grant execute on function public.mapsilip_push_record_rejection(text) to authenticated;

create function mapsilip_private.push_validate_preferences(p jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
  if p is null or jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))<>2 or
    not(p ?& array['enabled','categories']) or jsonb_typeof(p->'enabled')<>'boolean' or
    jsonb_typeof(p->'categories')<>'object' then raise exception 'invalid input' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(p->'categories'))<>5 or
    not((p->'categories') ?& array['payments','maintenance','accounts','visitors','concerns']) or
    exists(select 1 from jsonb_each(p->'categories') e where jsonb_typeof(e.value)<>'boolean') or
    ((p->>'enabled')::boolean and not exists(select 1 from jsonb_each(p->'categories') e where e.value='true'::jsonb)) then
    raise exception 'invalid input' using errcode='22023'; end if;
end $$;
create function mapsilip_private.push_subscription_valid(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare k text; decoded bytea; v text;
begin
  if p is null or jsonb_typeof(p)<>'object' or (select count(*) from jsonb_object_keys(p))<>2 or
    not(p ?& array['endpoint','keys']) or jsonb_typeof(p->'endpoint')<>'string' or length(p->>'endpoint')>4096 or
    (p->>'endpoint') !~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com)/[A-Za-z0-9_/?=&%+.:~-]+$' or
    jsonb_typeof(p->'keys')<>'object' or (select count(*) from jsonb_object_keys(p->'keys'))<>2 or
    not((p->'keys') ?& array['p256dh','auth']) then return false; end if;
  foreach k in array array['p256dh','auth'] loop
    v:=p->'keys'->>k;
    if v is null or v !~ '^[A-Za-z0-9_-]+$' or length(v)<>(case when k='p256dh' then 87 else 22 end) then return false; end if;
    decoded:=decode(translate(v,'-_','+/') || repeat('=',(4-length(v)%4)%4),'base64');
    if octet_length(decoded)<>(case when k='p256dh' then 65 else 16 end) or
       (k='p256dh' and get_byte(decoded,0)<>4) or
       translate(rtrim(replace(encode(decoded,'base64'),E'\n',''),'='),'+/','-_')<>v then return false; end if;
  end loop;
  return true;
exception when others then return false;
end $$;
create function public.mapsilip_push_preferences_get() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; p mapsilip_private.push_preferences%rowtype;
begin
 uid:=mapsilip_private.push_authorize(); select * into p from mapsilip_private.push_preferences where user_id=uid;
 return jsonb_build_object('available',true,'initialized',p.initialized_at is not null,'preferences',jsonb_build_object(
  'enabled',coalesce(p.enabled,false),'categories',coalesce(p.categories,'{"payments":true,"maintenance":true,"accounts":true,"visitors":true,"concerns":false}'::jsonb)));
end $$;
create function public.mapsilip_push_preferences_set(p_preferences jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; rejection text;
begin
 rejection:=mapsilip_private.push_attempt('preferences');
 if rejection is not null then return jsonb_build_object('push_error',rejection); end if;
 begin
 uid:=mapsilip_private.push_authorize();
 perform mapsilip_private.push_validate_preferences(p_preferences);
 perform 1 from auth.users where id=uid for update;
 if not exists(select 1 from mapsilip_private.push_preferences where user_id=uid and initialized_at is not null) then
   raise exception 'enrollment required' using errcode='22023'; end if;
 if (p_preferences->>'enabled')::boolean and not exists(select 1 from mapsilip_private.push_subscriptions s where s.user_id=uid and s.enabled and mapsilip_private.push_session_eligible(s)) then
   raise exception 'enrollment required' using errcode='22023'; end if;
 update mapsilip_private.push_preferences set enabled=(p_preferences->>'enabled')::boolean,categories=p_preferences->'categories',updated_at=now() where user_id=uid;
 return public.mapsilip_push_preferences_get();
exception when others then
  return jsonb_build_object('push_error',case when SQLSTATE in ('42501','22023','P0409') then SQLSTATE else '55000' end);
 end;
end $$;
create function public.mapsilip_push_subscription_upsert(p_subscription jsonb,p_capability text,p_initial_preferences jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; rejection text; sid uuid; h text; existing mapsilip_private.push_subscriptions%rowtype; p mapsilip_private.push_preferences%rowtype; rev bigint;
begin
 rejection:=mapsilip_private.push_attempt('subscription');
 if rejection is not null then return jsonb_build_object('push_error',rejection); end if;
 begin
 uid:=mapsilip_private.push_authorize(); sid:=(auth.jwt()->>'session_id')::uuid;

 if p_capability is null or p_capability !~ '^[0-9a-f]{64}$' or not mapsilip_private.push_subscription_valid(p_subscription) then
   raise exception 'invalid input' using errcode='22023'; end if;
 h:=encode(sha256(convert_to(p_capability,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('push-installation:'||h,0));
 -- Serialize initial preference initialization for this account, including concurrent first devices.
 perform 1 from auth.users where id=uid for update;
 select * into p from mapsilip_private.push_preferences where user_id=uid;
 if p_initial_preferences is not null then
   if p.initialized_at is not null then raise exception 'preferences_already_initialized' using errcode='P0409'; end if;
   perform mapsilip_private.push_validate_preferences(p_initial_preferences);
   if not (p_initial_preferences->>'enabled')::boolean then raise exception 'invalid input' using errcode='22023'; end if;
 elsif p.initialized_at is null then raise exception 'enrollment required' using errcode='22023'; end if;
 -- Serialize identical endpoints across users too; capability ownership is independent of caller JSON.
 perform pg_advisory_xact_lock(hashtextextended(p_subscription->>'endpoint',0));
 select * into existing from mapsilip_private.push_subscriptions where endpoint=p_subscription->>'endpoint' for update;
 if found and existing.installation_hash<>h then raise exception 'device binding conflict' using errcode='42501'; end if;
 if p_initial_preferences is not null then
  insert into mapsilip_private.push_preferences(user_id,enabled,categories,initialized_at)
    values(uid,true,p_initial_preferences->'categories',now()) on conflict(user_id) do update
    set enabled=true,categories=excluded.categories,initialized_at=excluded.initialized_at,updated_at=now();
 end if;
 select security_revision into rev from mapsilip_private.accounts where user_id=uid;
 update mapsilip_private.push_subscriptions set enabled=false,disabled_at=now(),generation=gen_random_uuid()
   where installation_hash=h and enabled and (user_id<>uid or auth_session_id<>sid or endpoint<>p_subscription->>'endpoint');
 if existing.id is not null then
  -- Reconciliation is idempotent. Only a real binding/key/eligibility change fences old work.
  if existing.user_id is distinct from uid or existing.auth_session_id is distinct from sid or
    existing.staff_security_revision is distinct from rev or not existing.enabled or
    existing.p256dh is distinct from p_subscription->'keys'->>'p256dh' or
    existing.auth is distinct from p_subscription->'keys'->>'auth' then
   update mapsilip_private.push_subscriptions set user_id=uid,auth_session_id=sid,staff_security_revision=rev,
    p256dh=p_subscription->'keys'->>'p256dh',auth=p_subscription->'keys'->>'auth',generation=gen_random_uuid(),enabled=true,
    bound_at=now(),updated_at=now(),last_seen_at=now(),disabled_at=null where id=existing.id;
  else
   update mapsilip_private.push_subscriptions set last_seen_at=now(),updated_at=now() where id=existing.id;
  end if;
 else
  insert into mapsilip_private.push_subscriptions(user_id,auth_session_id,staff_security_revision,installation_hash,endpoint,endpoint_hash,p256dh,auth)
  values(uid,sid,rev,h,p_subscription->>'endpoint',encode(sha256(convert_to(p_subscription->>'endpoint','UTF8')),'hex'),p_subscription->'keys'->>'p256dh',p_subscription->'keys'->>'auth');
 end if;
 return public.mapsilip_push_preferences_get();
exception when others then
  return jsonb_build_object('push_error',case when SQLSTATE in ('42501','22023','P0409') then SQLSTATE else '55000' end);
 end;
end $$;
create function public.mapsilip_push_subscription_revoke(p_capability text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; rejection text;
begin
 rejection:=mapsilip_private.push_attempt('subscription');
 if rejection is not null then return jsonb_build_object('push_error',rejection); end if;
 begin
 uid:=mapsilip_private.push_authorize();
 if p_capability is null or p_capability !~ '^[0-9a-f]{64}$' then raise exception 'invalid input' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('push-installation:'||encode(sha256(convert_to(p_capability,'UTF8')),'hex'),0));
 update mapsilip_private.push_subscriptions set enabled=false,disabled_at=now(),generation=gen_random_uuid()
  where user_id=uid and auth_session_id::text=auth.jwt()->>'session_id'
    and installation_hash=encode(sha256(convert_to(p_capability,'UTF8')),'hex');
 return jsonb_build_object('disabled',true);
exception when others then
  return jsonb_build_object('push_error',case when SQLSTATE in ('42501','22023','P0409') then SQLSTATE else '55000' end);
 end;
end $$;

-- No private schema exposure or default PUBLIC execute privilege.
revoke all on function mapsilip_private.push_authorize(), mapsilip_private.push_rate(text,integer),
 mapsilip_private.push_validate_preferences(jsonb),mapsilip_private.push_subscription_valid(jsonb)
 from public,anon,authenticated,service_role,mapsilip_security_executor;
revoke all on function public.mapsilip_push_preferences_get(),public.mapsilip_push_preferences_set(jsonb),
 public.mapsilip_push_subscription_upsert(jsonb,text,jsonb),public.mapsilip_push_subscription_revoke(text)
 from public,anon,authenticated,service_role,mapsilip_security_executor;
grant execute on function public.mapsilip_push_preferences_get(),public.mapsilip_push_preferences_set(jsonb),
 public.mapsilip_push_subscription_upsert(jsonb,text,jsonb),public.mapsilip_push_subscription_revoke(text) to authenticated;
-- Dispatch is independently gated in private runtime; no jobs or secrets are created.
alter table mapsilip_private.push_outbox add column expanded_at timestamptz, add column expansion_cursor uuid;
create index push_outbox_unexpanded on mapsilip_private.push_outbox(created_at) where expanded_at is null;
create function mapsilip_private.push_classify(k text) returns text
language plpgsql immutable set search_path='' as $$
declare u text:='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
begin
 if k ~ ('^invoice:'||u||'$') or k ~ ('^payment:'||u||':(approved|rejected)$') or k ~ ('^payment:'||u||':submitted:'||u||'$') then return 'payments'; end if;
 if k ~ ('^maintenance:'||u||':(in_progress|resolved)$') or k ~ ('^maintenance:'||u||':submitted:'||u||'$') then return 'maintenance'; end if;
 if k ~ ('^assignment:'||u||'$') or k ~ ('^room-prep:'||u||':'||u||'$') or k ~ ('^account-request:'||u||':(approved|rejected)$') or k ~ ('^account-request:'||u||':created:'||u||'$') then return 'accounts'; end if;
 if k ~ ('^visit:'||u||':(planned|cancelled):'||u||'$') then return 'visitors'; end if;
 if k ~ ('^concern:'||u||':resolved$') or k ~ ('^concern:'||u||':submitted:'||u||'$') then return 'concerns'; end if;
 return null;
end $$;
create function mapsilip_private.push_queue_notice() returns trigger
language plpgsql security definer set search_path='' as $$
declare category_value text;
begin
 if not mapsilip_private.push_is_enabled() then return new; end if;
 category_value:=mapsilip_private.push_classify(new.event_key);
 if category_value is not null and exists(select 1 from mapsilip_private.push_preferences p
   where p.user_id=new.recipient_id and p.enabled and p.categories->category_value='true'::jsonb) then
  insert into mapsilip_private.push_outbox(notification_id,recipient_id,category,created_at,expires_at)
   values(new.id,new.recipient_id,category_value,new.created_at,new.created_at+interval '1 hour') on conflict do nothing;
 end if;
 return new;
end $$;
create trigger mapsilip_push_queue after insert on public.notifications for each row execute function mapsilip_private.push_queue_notice();

create function mapsilip_private.push_session_eligible(s mapsilip_private.push_subscriptions) returns boolean
language sql stable security definer set search_path='' as $$
 select s.enabled and exists(select 1 from auth.sessions x join auth.users u on u.id=x.user_id
  where x.id=s.auth_session_id and x.user_id=s.user_id and (x.not_after is null or x.not_after>now())
   and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
   and (exists(select 1 from mapsilip_private.accounts a join mapsilip_private.session_admissions g on g.user_id=a.user_id
    where a.user_id=s.user_id and a.status='active' and not a.password_change_required
     and a.security_revision=s.staff_security_revision and g.auth_session_id=s.auth_session_id and g.security_revision=a.security_revision)
    or (s.staff_security_revision is null and u.email_confirmed_at is not null
     and not exists(select 1 from mapsilip_private.accounts a where a.user_id=s.user_id)
     and exists(select 1 from public.tenant_profiles p where p.user_id=s.user_id and p.status='active'))))
$$;
create function public.mapsilip_push_claim(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='2s' set lock_timeout='1s' as $$
declare o mapsilip_private.push_outbox%rowtype; s mapsilip_private.push_subscriptions%rowtype;
 result jsonb; remaining integer:=least(greatest(p_limit,1),20); visited integer; page_size integer;
begin
 if not mapsilip_private.push_is_enabled() then return '[]'::jsonb; end if;
 for o in select * from mapsilip_private.push_outbox where expanded_at is null and expires_at>now()
   order by created_at for update skip locked limit 20 loop
  exit when remaining<=0;
  visited:=0; page_size:=remaining;
  -- Bound inspected subscriptions, not just notices or successful inserts. Cursor survives invocations.
  for s in select * from mapsilip_private.push_subscriptions where user_id=o.recipient_id
    and id>coalesce(o.expansion_cursor,'00000000-0000-0000-0000-000000000000'::uuid) order by id limit page_size loop
   visited:=visited+1; remaining:=remaining-1;
   if s.enabled and s.bound_at<=o.created_at and mapsilip_private.push_session_eligible(s)
    and exists(select 1 from mapsilip_private.push_preferences p where p.user_id=o.recipient_id
      and p.enabled and p.categories->o.category='true'::jsonb) then
    insert into mapsilip_private.push_deliveries(outbox_id,subscription_id,subscription_generation)
     values(o.id,s.id,s.generation) on conflict do nothing;
   end if;
   update mapsilip_private.push_outbox set expansion_cursor=s.id where id=o.id;
  end loop;
  if visited<page_size then update mapsilip_private.push_outbox set expanded_at=now() where id=o.id; end if;
 end loop;
 with due as(select d.id from mapsilip_private.push_deliveries d where
  (d.status='pending' and d.next_attempt_at<=now()) or (d.status='leased' and d.lease_until<=now())
  order by d.next_attempt_at for update skip locked limit least(greatest(p_limit,1),20)),
 claimed as(update mapsilip_private.push_deliveries d set status='leased',lease_until=now()+interval '60 seconds',claim_token=gen_random_uuid(),attempt_reserved=false
  from due where d.id=due.id returning d.id,d.claim_token)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'token',claim_token)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function public.mapsilip_push_delivery_check(p_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' set statement_timeout='2s' set lock_timeout='1s' as $$
declare d mapsilip_private.push_deliveries%rowtype; o mapsilip_private.push_outbox%rowtype;
 s mapsilip_private.push_subscriptions%rowtype; p mapsilip_private.push_preferences%rowtype; n public.notifications%rowtype;
begin
 select * into d from mapsilip_private.push_deliveries where id=p_id and claim_token=p_token and status='leased' and lease_until>now() for update;
 if not found then return null; end if;
 select * into o from mapsilip_private.push_outbox where id=d.outbox_id;
 select * into s from mapsilip_private.push_subscriptions where id=d.subscription_id;
 select * into p from mapsilip_private.push_preferences where user_id=o.recipient_id;
 select * into n from public.notifications where id=o.notification_id;
 -- Revocation/consent/expiry outrank a temporary operational pause.
 if o.expires_at<=now() or n.read_at is not null or s.user_id is distinct from o.recipient_id or
   s.generation is distinct from d.subscription_generation or not coalesce(p.enabled,false) or
   p.categories->o.category is distinct from 'true'::jsonb or not mapsilip_private.push_session_eligible(s) or d.attempts>=5 then
  update mapsilip_private.push_deliveries set status='discarded',finished_at=now() where id=d.id;
  return null;
 end if;
 if not mapsilip_private.push_is_enabled() then
  update mapsilip_private.push_deliveries set status='pending',next_attempt_at=now()+interval '30 seconds',lease_until=null,claim_token=null where id=d.id;
  return jsonb_build_object('deferred',true);
 end if;
 update mapsilip_private.push_deliveries set attempts=attempts+1,attempt_reserved=true where id=d.id;
 return jsonb_build_object('id',d.id,'token',p_token,'attempt',d.attempts+1,'notificationId',o.notification_id,'category',o.category,
 'role',coalesce((select role from mapsilip_private.accounts where user_id=s.user_id),'tenant'),
 'ttl',greatest(1,floor(extract(epoch from o.expires_at-now())))::integer,
 'subscription',jsonb_build_object('endpoint',s.endpoint,'keys',jsonb_build_object('p256dh',s.p256dh,'auth',s.auth)));
end $$;
create function public.mapsilip_push_finish(p_id uuid,p_token uuid,p_outcome text,p_status integer,p_delay integer default 0) returns void
language plpgsql security definer set search_path='' set statement_timeout='2s' set lock_timeout='1s' as $$
declare d mapsilip_private.push_deliveries%rowtype; expiry timestamptz;
begin
 select * into d from mapsilip_private.push_deliveries where id=p_id and claim_token=p_token and status='leased' and lease_until>now() for update;
 if not found then return; end if;
 if not exists(select 1 from mapsilip_private.push_subscriptions s where s.id=d.subscription_id and s.generation=d.subscription_generation) then
  update mapsilip_private.push_deliveries set status='discarded',finished_at=now() where id=d.id; return;
 end if;
 select expires_at into expiry from mapsilip_private.push_outbox where id=d.outbox_id;
 if p_outcome in ('gone','invalid_subscription') then
  -- Provider401/403 may belong to this endpoint's VAPID restriction. Never touch global runtime.
  update mapsilip_private.push_subscriptions set enabled=false,disabled_at=now() where id=d.subscription_id and generation=d.subscription_generation;
  update mapsilip_private.push_deliveries set status='discarded',finished_at=now(),provider_status=p_status
   where id=d.id;
 elsif p_outcome in ('configuration','deferred') and expiry>now() then
  update mapsilip_private.push_deliveries set status='pending',next_attempt_at=now()+interval '30 seconds',lease_until=null,claim_token=null,provider_status=p_status where id=d.id;
 elsif p_outcome='retry' and d.attempts<5 and now()+make_interval(secs=>least(greatest(p_delay,30),3600))<expiry then
  update mapsilip_private.push_deliveries set status='pending',next_attempt_at=now()+make_interval(secs=>least(greatest(p_delay,30),3600)),lease_until=null,claim_token=null,provider_status=p_status where id=d.id;
 else
  update mapsilip_private.push_deliveries set status=case when p_outcome='accepted' then 'accepted' when p_outcome='failed' then 'failed' else 'discarded' end,
    provider_status=p_status,finished_at=now(),lease_until=null,claim_token=null where id=d.id;
 end if;
end $$;
create function public.mapsilip_push_release(p_claims jsonb) returns integer
language plpgsql security definer set search_path='' set statement_timeout='2s' set lock_timeout='1s' as $$
declare released integer;
begin
 if p_claims is null or jsonb_typeof(p_claims)<>'array' or jsonb_array_length(p_claims)>20 then
  raise exception 'invalid batch' using errcode='22023'; end if;
 update mapsilip_private.push_deliveries d set status='pending',next_attempt_at=now()+interval '5 seconds',lease_until=null,claim_token=null,
  attempts=case when d.attempt_reserved and coalesce(c.sent,true)=false then greatest(d.attempts-1,0) else d.attempts end,attempt_reserved=false
 from jsonb_to_recordset(p_claims) as c(id uuid,token uuid,sent boolean)
 where d.id=c.id and d.claim_token=c.token and d.status='leased';
 get diagnostics released=row_count;
 return released;
end $$;
revoke all on function mapsilip_private.push_classify(text),mapsilip_private.push_queue_notice(),
 mapsilip_private.push_session_eligible(mapsilip_private.push_subscriptions) from public,anon,authenticated,service_role,mapsilip_security_executor;
revoke all on function public.mapsilip_push_claim(integer),public.mapsilip_push_delivery_check(uuid,uuid),
 public.mapsilip_push_finish(uuid,uuid,text,integer,integer),public.mapsilip_push_release(jsonb) from public,anon,authenticated,service_role,mapsilip_security_executor;
grant execute on function public.mapsilip_push_claim(integer),public.mapsilip_push_delivery_check(uuid,uuid),
 public.mapsilip_push_finish(uuid,uuid,text,integer,integer),public.mapsilip_push_release(jsonb) to service_role;

commit;
