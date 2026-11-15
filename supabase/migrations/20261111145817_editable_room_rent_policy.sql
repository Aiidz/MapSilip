begin;
do $migration$
declare definition text; old_fragment text := $old$availability = p_data->>'availability', updated_at = now() where id = rec_id;$old$;
begin
 definition := pg_get_functiondef('mapsilip_private.operate(text,jsonb)'::regprocedure);
 if position(old_fragment in definition)=0 then raise exception 'room update function differs from expected definition'; end if;
 definition := replace(definition,old_fragment,$new$availability = p_data->>'availability',
 monthly_rent = case when p_data ? 'monthly_rent' then nullif(p_data->>'monthly_rent','')::numeric else room_rec.monthly_rent end,
 gender_policy = coalesce(p_data->>'gender_policy',room_rec.gender_policy), updated_at = now() where id = rec_id;$new$);
 execute definition;
end;
$migration$;
commit;
