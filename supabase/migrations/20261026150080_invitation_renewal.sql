begin;

create or replace function mapsilip_private.review_account_request(p_id uuid, p_decision text, p_invitation_hash text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor uuid := auth.uid(); r public.account_requests%rowtype;
begin
  if mapsilip_private.operational_role() <> 'owner' then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved','rejected')
     or (p_decision = 'approved' and coalesce(p_invitation_hash !~ '^[0-9a-f]{64}$',true))
     or (p_decision = 'rejected' and p_invitation_hash is not null) then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  select * into r from public.account_requests where id = p_id for update;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' and not (r.status = 'approved' and p_decision = 'approved') then
    raise exception 'already reviewed' using errcode = '23505';
  end if;
  update public.account_requests set status = p_decision, reviewer_id = actor, reviewed_at = now(), updated_at = now(),
    invitation_hash = p_invitation_hash,
    invitation_expires_at = case when p_decision = 'approved' then now() + interval '7 days' else null end
    where id = p_id;
  insert into public.operational_audit(actor_id,action,record_id)
    values(actor,case when r.status = 'approved' then 'account_request.invitation_renewed' else 'account_request.' || p_decision end,p_id);
  return jsonb_build_object('state',p_decision);
end;
$$;

commit;
