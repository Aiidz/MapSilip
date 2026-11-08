begin;

-- Preserve legacy account opt-outs by requiring each old device to enroll again.
update mapsilip_private.push_subscriptions s
set enabled=false, disabled_at=now(), generation=gen_random_uuid()
from mapsilip_private.push_preferences p
where p.user_id=s.user_id and not p.enabled and s.enabled;
update mapsilip_private.push_preferences
set enabled=true, categories='{"payments":true,"maintenance":true,"accounts":true,"visitors":true,"concerns":false}'::jsonb, updated_at=now()
where not enabled;

-- Account-wide settings are now internal delivery policy, not user controls.
revoke execute on function public.mapsilip_push_preferences_set(jsonb) from authenticated;

create function public.mapsilip_push_device_get(p_capability text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; device_enabled boolean:=false;
begin
 uid:=mapsilip_private.push_authorize();
 if p_capability is not null and p_capability ~ '^[a-f0-9]{64}$' then
  select exists(select 1 from mapsilip_private.push_subscriptions s
    where s.user_id=uid and s.auth_session_id=(auth.jwt()->>'session_id')::uuid
      and s.installation_hash=encode(sha256(convert_to(p_capability,'UTF8')),'hex')
      and mapsilip_private.push_session_eligible(s)) into device_enabled;
 end if;
 return public.mapsilip_push_preferences_get() || jsonb_build_object('enrolled',device_enabled);
end $$;
revoke all on function public.mapsilip_push_device_get(text) from public,anon,authenticated,service_role,mapsilip_security_executor;
grant execute on function public.mapsilip_push_device_get(text) to authenticated;

commit;
