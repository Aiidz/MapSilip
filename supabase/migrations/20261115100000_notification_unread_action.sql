create or replace function public.mapsilip_mark_notification_unread(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.notifications
  set read_at = null
  where id = p_id and recipient_id = actor;

  if not found then
    raise exception 'notification not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object('state', 'unread');
end;
$$;

revoke all on function public.mapsilip_mark_notification_unread(uuid) from public, anon;
grant execute on function public.mapsilip_mark_notification_unread(uuid) to authenticated;
