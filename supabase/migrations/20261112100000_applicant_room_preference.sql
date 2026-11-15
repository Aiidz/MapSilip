begin;
alter table public.account_requests add column preferred_room_id uuid references public.rooms(id) on delete set null;
create index account_requests_preferred_room on public.account_requests(preferred_room_id) where preferred_room_id is not null;
create function mapsilip_private.applicant_room_catalog() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.floor_label,r.room_number),'[]'::jsonb) from (
 select r.id,r.room_number,r.floor_label,r.capacity,r.availability,r.monthly_rent,r.gender_policy,
 greatest(0,r.capacity-(select count(*) from public.room_assignments a where a.room_id=r.id and a.ended_on is null)) as vacancies
 from public.rooms r where r.floor_label in ('2nd Floor','3rd Floor') order by r.floor_label,r.room_number limit 100
 ) r;
$$;
revoke all on function mapsilip_private.applicant_room_catalog() from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.applicant_room_catalog() to mapsilip_security_executor;
create function mapsilip_private.submit_account_request(p_email text,p_name text,p_phone text,p_user_id uuid,p_gender text,p_preferred_room_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; room_row public.rooms%rowtype;
begin
 if p_preferred_room_id is not null then
 select * into room_row from public.rooms where id=p_preferred_room_id for update;
 if not found or room_row.floor_label not in ('2nd Floor','3rd Floor') or room_row.availability<>'available'
 or (room_row.gender_policy<>'any' and room_row.gender_policy is distinct from p_gender)
 or (select count(*) from public.room_assignments where room_id=p_preferred_room_id and ended_on is null)>=room_row.capacity then
 raise exception 'room preference no longer eligible' using errcode='22023'; end if;
 end if;
 result:=mapsilip_private.submit_account_request(p_email,p_name,p_phone,p_user_id,p_gender);
 update public.account_requests set preferred_room_id=p_preferred_room_id where id=(result->>'id')::uuid and status='pending';
 return result;
end; $$;
revoke all on function mapsilip_private.submit_account_request(text,text,text,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function mapsilip_private.submit_account_request(text,text,text,uuid,text,uuid) to mapsilip_security_executor;
commit;
