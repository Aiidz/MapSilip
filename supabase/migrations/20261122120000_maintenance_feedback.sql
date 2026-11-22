alter table public.maintenance_requests
  add column satisfaction_rating smallint check (satisfaction_rating between 1 and 5),
  add column satisfaction_comment text check (char_length(satisfaction_comment) <= 1000);

create function mapsilip_private.rate_maintenance(p_id uuid, p_rating integer, p_comment text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or mapsilip_private.tenant_active() is not true then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_rating is null or p_rating not between 1 and 5 or char_length(p_comment) > 1000 then
    raise exception 'invalid feedback' using errcode = '22023';
  end if;

  update public.maintenance_requests
  set satisfaction_rating = p_rating,
      satisfaction_comment = nullif(btrim(p_comment), '')
  where id = p_id and tenant_id = actor
    and status = 'resolved' and satisfaction_rating is null;

  if not found then
    raise exception 'request unavailable for feedback' using errcode = 'P0002';
  end if;
end;
$$;

create function public.mapsilip_rate_maintenance(p_id uuid, p_rating integer, p_comment text)
returns void
language sql
security invoker
set search_path = ''
as $$
  select mapsilip_private.rate_maintenance(p_id, p_rating, p_comment);
$$;

revoke all on function mapsilip_private.rate_maintenance(uuid, integer, text) from public, anon;
revoke all on function public.mapsilip_rate_maintenance(uuid, integer, text) from public, anon;
grant execute on function mapsilip_private.rate_maintenance(uuid, integer, text) to authenticated;
grant execute on function public.mapsilip_rate_maintenance(uuid, integer, text) to authenticated;
