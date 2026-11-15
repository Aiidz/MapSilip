begin;
alter table public.rooms add column monthly_rent numeric(12,2) check (monthly_rent > 0), add column gender_policy text not null default 'any' check (gender_policy in ('any','male','female'));
alter table public.account_requests add column gender text check (gender in ('male','female'));
alter table public.tenant_profiles add column gender text check (gender in ('male','female'));
do $$ begin
 if exists (select 1 from public.rooms r join public.room_assignments a on a.room_id=r.id and a.ended_on is null where r.room_number in ('1','2','3','4','5','6','7','8','9') group by r.id having count(*) > case when r.room_number in ('1','2','3') then 6 when r.room_number='4' then 1 else 3 end) then raise exception 'existing occupants exceed requested capacity'; end if;
end; $$;
-- Preserve room identities, occupants, and all historical invoices.
update public.rooms set capacity = case when room_number in ('1','2','3') then 6 when room_number = '4' then 1 else 3 end,
 monthly_rent = case when room_number in ('1','2','3') then 2000 when room_number = '4' then 5000 else 2500 end,
 gender_policy = case when room_number = '1' then 'male' when room_number in ('2','3') then 'female' else 'any' end,
 updated_at = now() where room_number in ('1','2','3','4','5','6','7','8','9');
create function mapsilip_private.submit_account_request(p_email text,p_name text,p_phone text,p_user_id uuid,p_gender text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if p_gender is null or p_gender not in ('male','female') then raise exception 'gender required' using errcode='22023'; end if;
 result := mapsilip_private.submit_account_request(p_email,p_name,p_phone,p_user_id);
 update public.account_requests set gender=p_gender where id=(result->>'id')::uuid and status='pending';
 return result;
end; $$;
revoke all on function mapsilip_private.submit_account_request(text,text,text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function mapsilip_private.submit_account_request(text,text,text,uuid,text) to mapsilip_security_executor;
create function mapsilip_private.set_tenant_gender() returns trigger language plpgsql set search_path='' as $$
begin
 select r.gender into new.gender from public.account_requests r where r.activated_user_id=new.user_id;
 return new;
end; $$;
revoke all on function mapsilip_private.set_tenant_gender() from public, anon, authenticated, service_role;
create trigger tenant_gender_from_application before insert on public.tenant_profiles for each row execute function mapsilip_private.set_tenant_gender();
create function mapsilip_private.check_room_assignment_policy() returns trigger language plpgsql set search_path='' as $$
declare room_row public.rooms%rowtype; tenant_gender text;
begin
 if new.ended_on is not null then return new; end if;
 select * into room_row from public.rooms where id=new.room_id for update;
 select gender into tenant_gender from public.tenant_profiles where user_id=new.tenant_id;
 if room_row.gender_policy <> 'any' and tenant_gender is distinct from room_row.gender_policy then raise exception 'tenant does not match room gender policy' using errcode='23514'; end if;
 if (select count(*) from public.room_assignments where room_id=new.room_id and ended_on is null and id<>new.id) >= room_row.capacity then raise exception 'room full' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function mapsilip_private.check_room_assignment_policy() from public, anon, authenticated, service_role;
create trigger room_assignment_policy before insert or update on public.room_assignments for each row execute function mapsilip_private.check_room_assignment_policy();
create or replace function mapsilip_private.room_context(p_room_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  viewer_role text;
  room_row public.rooms%rowtype;
  residents jsonb := '[]'::jsonb;
  visits jsonb := '[]'::jsonb;
  maintenance jsonb := '[]'::jsonb;
  local_today date := (pg_catalog.now() at time zone 'Asia/Manila')::date;
begin
  if mapsilip_private.can_read('tenant.application.approve') then
    viewer_role := 'owner';
  elsif mapsilip_private.can_read('staff.access.inspect') then
    viewer_role := 'caretaker';
  end if;
  if viewer_role not in ('owner', 'caretaker') or viewer_role is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select r.* into room_row from public.rooms r where r.id = p_room_id;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;

  if viewer_role = 'owner' then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', p.user_id, 'display_name', p.display_name, 'phone', p.phone,
      'email', u.email, 'emergency_contact', p.emergency_contact, 'status', p.status
    ) order by p.display_name, p.user_id), '[]'::jsonb)
      into residents
    from public.room_assignments a
    join public.tenant_profiles p on p.user_id = a.tenant_id
    join auth.users u on u.id = p.user_id
    where a.room_id = p_room_id and a.ended_on is null;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) order by v.visit_on, v.arrival_time), '[]'::jsonb)
      into visits from (
        select v.id, v.visitor_name, v.visit_on, v.arrival_time, v.departure_time,
          v.purpose, v.cancelled_at, p.display_name as resident_name
        from public.planned_visits v
        join public.room_assignments a on a.tenant_id = v.tenant_id
          and a.room_id = p_room_id and v.visit_on >= a.started_on
          and (a.ended_on is null or v.visit_on <= a.ended_on)
        join public.tenant_profiles p on p.user_id = v.tenant_id
        order by v.visit_on desc, v.id desc limit 100
      ) v;
  else
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'user_id', p.user_id, 'display_name', p.display_name, 'phone', p.phone, 'status', p.status
    ) order by p.display_name, p.user_id), '[]'::jsonb)
      into residents
    from public.room_assignments a
    join public.tenant_profiles p on p.user_id = a.tenant_id
    where a.room_id = p_room_id and a.ended_on is null;

    select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) order by v.visit_on, v.arrival_time), '[]'::jsonb)
      into visits from (
        select v.id, v.visitor_name, v.visit_on, v.arrival_time, v.departure_time,
          null::timestamptz as cancelled_at, p.display_name as resident_name
        from public.planned_visits v
        join public.room_assignments a on a.tenant_id = v.tenant_id
          and a.room_id = p_room_id and a.ended_on is null
        join public.tenant_profiles p on p.user_id = v.tenant_id
        where v.cancelled_at is null and v.visit_on >= local_today
        order by v.visit_on, v.id limit 50
      ) v;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.created_at desc), '[]'::jsonb)
    into maintenance from (
      select m.id, m.category, m.description, m.status, m.staff_response,
        m.attachment_id, m.created_at, m.updated_at
      from public.maintenance_requests m
      where m.room_id = p_room_id
      order by m.created_at desc, m.id desc limit 100
    ) m;

  return pg_catalog.jsonb_build_object(
    'viewer_role', viewer_role,
    'room', pg_catalog.jsonb_build_object(
      'id', room_row.id, 'room_number', room_row.room_number,
      'floor_label', room_row.floor_label, 'capacity', room_row.capacity,
      'availability', room_row.availability, 'monthly_rent', room_row.monthly_rent, 'gender_policy', room_row.gender_policy),
    'residents', residents, 'visits', visits, 'maintenance', maintenance);
end;
$$;


commit;
