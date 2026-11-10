-- Asynchronous wake-up only: existing runtime, recipient and delivery gates remain authoritative.
begin;
alter table mapsilip_private.push_runtime add column last_dispatch_requested_at timestamptz;
create function mapsilip_private.push_wake_dispatch() returns boolean
language plpgsql security definer set search_path='' set lock_timeout='100ms' as $$
declare worker_secret text;
begin
 if not mapsilip_private.push_is_enabled() then return false; end if;
 if coalesce(current_setting('mapsilip.push_wake_transaction',true),'false')='true' then return false; end if;
 if not (exists(select 1 from mapsilip_private.push_outbox where expanded_at is null and expires_at>now())
  or exists(select 1 from mapsilip_private.push_deliveries where status='pending' and next_attempt_at<=now())
  or exists(select 1 from mapsilip_private.push_deliveries where status='leased' and lease_until<=now())) then return false; end if;
 -- Never make business transactions wait for another notification transaction.
 if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('mapsilip-push-wakeup',0)) then return false; end if;
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='mapsilip_push_worker_secret';
 if worker_secret is null or length(worker_secret)=0 then return false; end if;
 update mapsilip_private.push_runtime set last_dispatch_requested_at=clock_timestamp()
 where singleton and (last_dispatch_requested_at is null or last_dispatch_requested_at<=clock_timestamp()-interval '3 seconds');
 if not found then return false; end if;
 perform net.http_post(url:='https://mapsilip.vercel.app/api/push/dispatch',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
  body:='{}'::jsonb,timeout_milliseconds:=35000);
 perform set_config('mapsilip.push_wake_transaction','true',true);
 return true;
exception when others then
 -- Roll back this wake-up attempt, retaining durable work for the recovery scheduler.
 return false;
end $$;
revoke all on function mapsilip_private.push_wake_dispatch() from public,anon,authenticated,service_role,mapsilip_security_executor;
create function mapsilip_private.push_wake_after_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform mapsilip_private.push_wake_dispatch();
 return null;
end $$;
revoke all on function mapsilip_private.push_wake_after_insert() from public,anon,authenticated,service_role,mapsilip_security_executor;
create trigger push_prompt_dispatch after insert on mapsilip_private.push_outbox
 for each statement execute function mapsilip_private.push_wake_after_insert();
commit;
