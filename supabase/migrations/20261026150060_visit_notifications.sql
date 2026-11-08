begin;

create function mapsilip_private.notify_planned_visit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications(recipient_id,title,body,href,event_key)
      select a.user_id,'Planned visit','A tenant has added a planned visit.','/management/visitors',
        'visit:' || new.id::text || ':planned:' || a.user_id::text
      from mapsilip_private.accounts a where a.role = 'owner' and a.status = 'active'
      on conflict (event_key) do nothing;
  elsif old.cancelled_at is null and new.cancelled_at is not null then
    insert into public.notifications(recipient_id,title,body,href,event_key)
      select a.user_id,'Visit cancelled','A tenant cancelled a planned visit.','/management/visitors',
        'visit:' || new.id::text || ':cancelled:' || a.user_id::text
      from mapsilip_private.accounts a where a.role = 'owner' and a.status = 'active'
      on conflict (event_key) do nothing;
  end if;
  return new;
end;
$$;
alter function mapsilip_private.notify_planned_visit() owner to postgres;
revoke all on function mapsilip_private.notify_planned_visit() from public,anon,authenticated,service_role;
create trigger mapsilip_planned_visit_notice after insert or update of cancelled_at on public.planned_visits
  for each row execute function mapsilip_private.notify_planned_visit();

commit;
