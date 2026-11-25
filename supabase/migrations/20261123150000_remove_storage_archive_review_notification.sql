begin;

do $migration$
declare
  definition text := pg_get_functiondef('mapsilip_private.storage_manage(text,jsonb)'::regprocedure);
  block_start integer;
  block_end integer;
  after_block text;
begin
  block_start := position('   insert into public.notifications(recipient_id,title,body,href,event_key)
    select a.user_id,''Storage archive review''' in definition);
  if block_start = 0 then
    raise exception 'Storage archive reminder block not found';
  end if;
  after_block := substring(definition from block_start);
  block_end := position('   select coalesce(sum(' in after_block);
  if block_end = 0 then
    raise exception 'Storage reminder block end not found';
  end if;
  execute substring(definition from 1 for block_start - 1) || substring(after_block from block_end);
end
$migration$;

delete from public.notifications
where title = 'Storage archive review' and event_key like 'storage-archive:%';

commit;
