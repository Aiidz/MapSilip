import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const url=process.env.MAPSILIP_PUSH_TEST_DATABASE_URL;
test('Realtime candidate adds only notifications, preserves security and fails closed with RLS off',{skip:!url},async()=>{
 const c=new pg.Client({connectionString:url});await c.connect();
 try{
  await c.query('begin');await c.query('create publication supabase_realtime for table public.rooms');
  const security=async()=>JSON.stringify((await c.query("select relrowsecurity,relacl from pg_class where oid='public.notifications'::regclass")).rows);
  const before=await security();const sql=(await readFile('supabase/migrations/20261108153140_foreground_notification_realtime.sql','utf8')).replace(/^begin;$/m,'').replace(/^commit;$/m,'');
  await c.query(sql);await c.query(sql);
  assert.deepEqual((await c.query("select tablename from pg_publication_tables where pubname='supabase_realtime' order by tablename")).rows.map(r=>r.tablename),['notifications','rooms']);
  assert.equal(await security(),before);
  await c.query('savepoint unsafe');await c.query('alter table public.notifications disable row level security');
  await assert.rejects(c.query(sql),/RLS must remain enabled/);await c.query('rollback to savepoint unsafe');
  assert.equal(await security(),before);
 }finally{await c.query('rollback');await c.end()}
});
