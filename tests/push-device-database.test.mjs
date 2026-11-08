import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
const url=process.env.MAPSILIP_PUSH_TEST_DATABASE_URL;
const run=url?test:test.skip;
run('device controls isolate accounts, sessions and installations; disabling one device preserves another',async()=>{
 const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'55440');
 const c=new pg.Client({connectionString:url});await c.connect();
 const uid='66666666-6666-4666-8666-666666666666',other='77777777-7777-4777-8777-777777777777';
 const sid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',second='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',foreign='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const prefs={enabled:true,categories:{payments:true,maintenance:true,accounts:true,visitors:true,concerns:false}};
 const sub=n=>({endpoint:'https://web.push.apple.com/device-only-'+n,keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}});
 async function as(user,session,sql,args=[]){await c.query('set role authenticated');await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session})]);try{return (await c.query(sql,args)).rows[0]?.v}finally{await c.query('reset role')}}
 const status=(user,session,cap)=>as(user,session,'select public.mapsilip_push_device_get($1) v',[cap]);
 try{
  await c.query('begin');
  assert.ok((await c.query("select to_regprocedure('public.mapsilip_push_device_get(text)') as function")).rows[0].function,'device status RPC must be installed');
  await c.query("insert into auth.users(id,email,email_confirmed_at) values($1,'device-a@example.invalid',now()),($2,'device-b@example.invalid',now())",[uid,other]);
  await c.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2),($4,$5)',[sid,uid,second,foreign,other]);
  await c.query("insert into public.tenant_profiles(user_id,display_name) values($1,'Synthetic device A'),($2,'Synthetic device B')",[uid,other]);
  assert.equal((await status(uid,sid,null)).enrolled,false);
  await as(uid,sid,'select public.mapsilip_push_subscription_upsert($1,$2,$3) v',[sub('a'),'a'.repeat(64),prefs]);
  await as(uid,second,'select public.mapsilip_push_subscription_upsert($1,$2,null) v',[sub('b'),'b'.repeat(64)]);
  assert.equal((await status(uid,sid,'a'.repeat(64))).enrolled,true);
  assert.equal((await status(uid,second,'b'.repeat(64))).enrolled,true);
  assert.equal((await status(uid,second,'a'.repeat(64))).enrolled,false);
  assert.equal((await status(other,foreign,'a'.repeat(64))).enrolled,false);
  assert.equal((await status(uid,sid,'invalid')).enrolled,false);
  const before=(await c.query('select sum(attempts) n from mapsilip_private.push_rate_limits where user_id=$1',[uid])).rows[0].n;
  await status(uid,sid,'a'.repeat(64));
  assert.equal((await c.query('select sum(attempts) n from mapsilip_private.push_rate_limits where user_id=$1',[uid])).rows[0].n,before);
  await as(uid,sid,'select public.mapsilip_push_subscription_revoke($1) v',['a'.repeat(64)]);
  assert.equal((await status(uid,sid,'a'.repeat(64))).enrolled,false);
  assert.equal((await status(uid,second,'b'.repeat(64))).enrolled,true);
  assert.equal((await c.query("select has_function_privilege('authenticated','public.mapsilip_push_preferences_set(jsonb)','EXECUTE') allowed")).rows[0].allowed,false);
  // Execute the actual migration's legacy opt-out transition against synthetic push rows.
  await c.query('update mapsilip_private.push_preferences set enabled=false where user_id=$1',[uid]);
  const sql=await readFile('supabase/migrations/20261106081010_push_device_controls.sql','utf8');
  await c.query(sql.slice(sql.indexOf('-- Preserve'),sql.indexOf('-- Account-wide')));
  assert.equal((await status(uid,second,'b'.repeat(64))).enrolled,false);
  assert.equal((await c.query('select enabled from mapsilip_private.push_preferences where user_id=$1',[uid])).rows[0].enabled,true);
 }finally{await c.query('rollback');await c.end()}
});
