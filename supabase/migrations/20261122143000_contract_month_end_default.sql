begin;

create or replace function public.mapsilip_review_account_contract(
  p_id uuid, p_decision text, p_room_id uuid, p_started_on date, p_note text,
  p_contract_id uuid, p_contract_end_on date
) returns jsonb language sql volatile security invoker set search_path = '' as $$
  select mapsilip_private.review_account_contract(
    p_id, p_decision, p_room_id, p_started_on, p_note, p_contract_id,
    case when p_decision = 'approved' then coalesce(p_contract_end_on,
      (date_trunc('month',
        coalesce(p_started_on, (now() at time zone 'Asia/Manila')::date)
        + interval '6 months' - interval '1 day') + interval '1 month - 1 day')::date)
    else p_contract_end_on end
  );
$$;

commit;
