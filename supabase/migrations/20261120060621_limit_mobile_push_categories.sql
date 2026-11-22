begin;

-- Keep device enrollment as the opt-in. Align the internal category policy.
alter table mapsilip_private.push_preferences alter column categories
  set default '{"payments":true,"maintenance":true,"accounts":true,"visitors":false,"concerns":true}'::jsonb;

update mapsilip_private.push_preferences
set categories = categories || '{"payments":true,"maintenance":true,"accounts":true,"visitors":false,"concerns":true}'::jsonb,
    updated_at = now()
where enabled;

create or replace function mapsilip_private.push_classify(k text) returns text
language plpgsql immutable set search_path='' as $$
declare u text:='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
begin
 if k ~ ('^rent-reminder:'||u||':(7|3|0|-1)$') then return 'payments'; end if;
 if k ~ ('^invoice:'||u||'$') or k ~ ('^payment:'||u||':(approved|rejected)$') or k ~ ('^payment:'||u||':submitted:'||u||'$') then return 'payments'; end if;
 if k ~ ('^maintenance:'||u||':(in_progress|resolved)$') or k ~ ('^maintenance:'||u||':submitted:'||u||'$') then return 'maintenance'; end if;
 if k ~ ('^account-request:'||u||':(approved|rejected)$') then return 'accounts'; end if;
 if k ~ ('^concern:'||u||':resolved$') or k ~ ('^concern:'||u||':submitted:'||u||'$') then return 'concerns'; end if;
 return null;
end $$;

-- Cancel outstanding pushes for events no longer eligible under this policy.
update mapsilip_private.push_outbox o
set expires_at = now()
from public.notifications n
where n.id = o.notification_id and o.expires_at > now()
  and mapsilip_private.push_classify(n.event_key) is null;

commit;
