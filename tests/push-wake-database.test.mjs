import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
const url=process.env.MAPSILIP_PUSH_TEST_DATABASE_URL;
test('async wake coalesces bursts, preserves failures, honors pause and private grants',{skip:!url},async()=>{
 const c=new pg.Client({connectionString:url});await c.connect();
 const wake=async()=> (await c.query('select mapsilip_private.push_wake_dispatch() v')).rows[0].v;
 try {
  await c.query('begin');
  // Local-only network and Vault doubles; never issue a real HTTP request.
  await c.query(`create schema net; create schema vault;
   create table vault.decrypted_secrets(name text,decrypted_secret text);
   insert into vault.decrypted_secrets values('mapsilip_push_worker_secret','synthetic-local-only');
   create table mapsilip_test.requests(url text,headers jsonb,timeout_ms int);
   create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds int default 2000) returns bigint language plpgsql as $$begin
    if current_setting('mapsilip_test.fail_http',true)='true' then raise exception 'synthetic failure';end if;
    insert into mapsilip_test.requests values(url,headers,timeout_milliseconds);return 1;end$$;`);
  const {readFile}=await import('node:fs/promises');
  const migration=await readFile('supabase/migrations/20261108141329_push_prompt_dispatch.sql','utf8');
  await c.query(migration.replace(/^begin;$/m,'').replace(/^commit;$/m,''));
  assert.equal(await wake(),false,'empty queue must not invoke Vercel');
  // Use a local synthetic due delivery without disturbing application fixtures.
  await c.query('alter table mapsilip_private.push_deliveries disable trigger all');
  await c.query(`insert into mapsilip_private.push_deliveries(outbox_id,subscription_id,subscription_generation)
    values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid())`);
  await c.query("select set_config('mapsilip_test.push_paused','true',true)");
  assert.equal(await wake(),false);
  await c.query("select set_config('mapsilip_test.push_paused','false',true)");
  await c.query("select set_config('mapsilip_test.fail_http','true',true)");
  assert.equal(await wake(),false);
  assert.equal((await c.query('select last_dispatch_requested_at t from mapsilip_private.push_runtime')).rows[0].t,null,'failed enqueue rolls back throttle');
  assert.equal((await c.query('select count(*) n from mapsilip_private.push_deliveries')).rows[0].n,'1','durable work survives wake failure');
  await c.query("select set_config('mapsilip_test.fail_http','false',true)");
  const concurrent=new pg.Client({connectionString:url});await concurrent.connect();
  try {
   await concurrent.query("select pg_advisory_lock(hashtextextended('mapsilip-push-wakeup',0))");
   assert.equal(await wake(),false,'concurrent wake returns immediately without duplicate request');
  }finally{await concurrent.query('select pg_advisory_unlock_all()');await concurrent.end()}
  assert.equal(await wake(),true);
  for(let i=0;i<90;i++)assert.equal(await wake(),false);
  const requests=(await c.query('select * from mapsilip_test.requests')).rows;
  assert.equal(requests.length,1);assert.equal(requests[0].url,'https://mapsilip.vercel.app/api/push/dispatch');
  assert.equal(requests[0].timeout_ms,35000);assert.equal(requests[0].headers.Authorization,'Bearer synthetic-local-only');
  await c.query("select set_config('mapsilip.push_wake_transaction','false',true)");
  assert.equal(await wake(),false,'cross-transaction throttle independently prevents storms');
  await c.query("update mapsilip_private.push_runtime set last_dispatch_requested_at=now()-interval '10 seconds'");
  assert.equal(await wake(),true,'recovery can wake due work again');
  await c.query("select set_config('mapsilip.push_wake_transaction','false',true)");
  await c.query("update mapsilip_private.push_runtime set last_dispatch_requested_at=now()-interval '10 seconds'");
  const constraints=(await c.query("select conname from pg_constraint where conrelid='mapsilip_private.push_outbox'::regclass and contype='f'")).rows;
  for(const {conname} of constraints)await c.query('alter table mapsilip_private.push_outbox drop constraint '+ '"'+conname.replaceAll('"','""')+'"');
  await c.query("insert into mapsilip_private.push_outbox(notification_id,recipient_id,category,expires_at) select gen_random_uuid(),gen_random_uuid(),'accounts',now()+interval '1 hour' from generate_series(1,90)");
  assert.equal((await c.query('select count(*) n from mapsilip_test.requests')).rows[0].n,'3','90-row statement triggers exactly one asynchronous wake');
  for(const role of ['anon','authenticated','service_role','mapsilip_security_executor']){
   assert.equal((await c.query("select has_function_privilege($1,'mapsilip_private.push_wake_dispatch()','execute') v",[role])).rows[0].v,false);
  }
  assert.equal((await c.query('select enabled from mapsilip_private.push_runtime')).rows[0].enabled,false);
 }finally{await c.query('rollback');await c.end()}
});
