import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
const url=process.env.MAPSILIP_PUSH_TEST_DATABASE_URL;
const run=url?test:test.skip;
const uid='44444444-4444-4444-8444-444444444444';
const other='55555555-5555-4555-8555-555555555555';
const sid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const secondSid='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const prefs={enabled:true,categories:{payments:true,maintenance:true,accounts:true,visitors:true,concerns:false}};
const sub=n=>({endpoint:'https://web.push.apple.com/remediation-'+n,keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}});
async function connection(){const t=new URL(url);assert.equal(t.hostname,'127.0.0.1');assert.equal(t.port,'55440');const c=new pg.Client({connectionString:url});await c.connect();return c}
async function identity(c,user=uid,session=sid){await c.query('set role authenticated');await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:user,session_id:session})])}
async function enroll(c,n,cap='a'.repeat(64),initial=null){return (await c.query('select public.mapsilip_push_subscription_upsert($1,$2,$3) v',[sub(n),cap,initial])).rows[0].v}
async function setup(c){
 await c.query("insert into auth.users(id,email,email_confirmed_at) values($1,'remediation-a@example.invalid',now()),($2,'remediation-b@example.invalid',now())",[uid,other]);
 await c.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[sid,uid,secondSid,other]);
 await c.query("insert into public.tenant_profiles(user_id,display_name) values($1,'Synthetic remediation A'),($2,'Synthetic remediation B')",[uid,other]);
}
async function notice(c,user=uid,suffix='resolved'){
 return (await c.query("insert into public.notifications(recipient_id,title,body,href,event_key) values($1,'Synthetic','Synthetic','/tenant/maintenance',$2) returning id",[user,'maintenance:'+crypto.randomUUID()+':'+suffix])).rows[0].id;
}
run('remediation: unchanged enrollment preserves generation and queued delivery; real change invalidates it',async()=>{
 const c=await connection();try{await c.query('begin');await setup(c);await identity(c);assert.equal((await enroll(c,1,undefined,prefs)).available,true);await c.query('reset role');
 await notice(c);let claims=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v;assert.equal(claims.length,1);
 const before=(await c.query('select generation from mapsilip_private.push_subscriptions where user_id=$1',[uid])).rows[0].generation;
 await identity(c);await enroll(c,1);await c.query('reset role');
 assert.equal((await c.query('select generation from mapsilip_private.push_subscriptions where user_id=$1',[uid])).rows[0].generation,before);
 assert.ok((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[claims[0].id,claims[0].token])).rows[0].v);
 await identity(c);
 const changed={...sub(1),keys:{...sub(1).keys,auth:Buffer.alloc(16,2).toString('base64url')}};
 assert.equal((await c.query('select public.mapsilip_push_subscription_upsert($1,$2,null) v',[changed,'a'.repeat(64)])).rows[0].v.available,true);
 await c.query('reset role');
 assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[claims[0].id,claims[0].token])).rows[0].v,null);
 await notice(c);claims=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v;
 await identity(c);await enroll(c,2);await c.query('reset role');
 assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[claims[0].id,claims[0].token])).rows[0].v,null);
 await notice(c);claims=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v;
 await identity(c);await c.query('select public.mapsilip_push_subscription_revoke($1)',['a'.repeat(64)]);await c.query('reset role');
 assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[claims[0].id,claims[0].token])).rows[0].v,null);
 }finally{await c.query('rollback');await c.end()}
});
run('remediation: endpoint403 isolation preserves global availability and other account delivery; pause preserves work',async()=>{
 const c=await connection();try{await c.query('begin');await setup(c);await identity(c);await enroll(c,1,undefined,prefs);await identity(c,other,secondSid);await enroll(c,2,'b'.repeat(64),prefs);await c.query('reset role');
 await notice(c);await notice(c,other);const claims=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v;assert.equal(claims.length,2);
 await c.query("select public.mapsilip_push_finish($1,$2,'invalid_subscription',403,0)",[claims[0].id,claims[0].token]);
 assert.equal((await c.query('select mapsilip_private.push_is_enabled() v')).rows[0].v,true);
 assert.ok((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[claims[1].id,claims[1].token])).rows[0].v);
 await c.query("select set_config('mapsilip_test.push_paused','true',false)");
 await c.query('select public.mapsilip_push_delivery_check($1,$2)',[claims[1].id,claims[1].token]);
 assert.equal((await c.query('select status from mapsilip_private.push_deliveries where id=$1',[claims[1].id])).rows[0].status,'pending');
 await c.query("select set_config('mapsilip_test.push_paused','false',false)");
 await c.query("update mapsilip_private.push_deliveries set next_attempt_at=now()-interval '1 second' where id=$1",[claims[1].id]);
 assert.equal((await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v.length,1);
 assert.equal((await c.query('select enabled from mapsilip_private.push_runtime')).rows[0].enabled,false);
 }finally{await c.query('rollback');await c.end()}
});
run('remediation: rejected invalid, conflict and unauthorized mutations consume persistent account quota',async()=>{
 const c=await connection();try{await c.query('begin');await setup(c);await identity(c);await enroll(c,1,undefined,prefs);
 const invalid=await c.query('select public.mapsilip_push_subscription_upsert($1,$2,null) v',[{...sub(2),endpoint:'https://localhost/x'},'a'.repeat(64)]);assert.equal(invalid.rows[0].v.push_error,'22023');
 const conflict=await enroll(c,1,undefined,prefs);assert.equal(conflict.push_error,'P0409');
 await c.query('reset role');await c.query("update public.tenant_profiles set status='inactive' where user_id=$1",[uid]);await identity(c);
 assert.equal((await enroll(c,2)).push_error,'42501');await c.query('reset role');
 assert.equal((await c.query("select attempts from mapsilip_private.push_rate_limits where user_id=$1 and kind='subscription'",[uid])).rows[0].attempts,4);
 await identity(c);for(let i=0;i<6;i++)assert.equal((await enroll(c,2)).push_error,'42501');assert.equal((await enroll(c,2)).push_error,'P0429');
 }finally{await c.query('rollback');await c.end()}
});
run('remediation: fanout visits at most20 devices per claim and resumes to deliver all eligible devices',async()=>{
 const c=await connection();try{await c.query('begin');await setup(c);
 await c.query('insert into mapsilip_private.push_preferences(user_id,enabled,categories,initialized_at) values($1,true,$2,now())',[uid,prefs.categories]);
 for(let i=0;i<45;i++)await c.query("insert into mapsilip_private.push_subscriptions(user_id,auth_session_id,installation_hash,endpoint,endpoint_hash,p256dh,auth) values($1,$2,$3,$4,$5,$6,$7)",[uid,sid,i.toString(16).padStart(64,'0'),sub(i).endpoint,'hash'+i,sub(i).keys.p256dh,sub(i).keys.auth]);
 const id=await notice(c);let total=0;
 for(let batch=0;batch<3;batch++){
 const claims=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v;assert.ok(claims.length<=20);total+=claims.length;
 for(const claim of claims)await c.query("select public.mapsilip_push_finish($1,$2,'accepted',201,0)",[claim.id,claim.token]);
 assert.equal(Number((await c.query('select count(*) n from mapsilip_private.push_deliveries')).rows[0].n),Math.min(45,(batch+1)*20));
 }
 assert.equal(total,45);assert.ok((await c.query('select expanded_at from mapsilip_private.push_outbox where notification_id=$1',[id])).rows[0].expanded_at);
 }finally{await c.query('rollback');await c.end()}
});

async function cleanup(c){
 await c.query('reset role');
 for(const table of ['mapsilip_private.push_subscriptions','mapsilip_private.push_preferences','mapsilip_private.push_rate_limits','public.tenant_profiles','auth.sessions'])await c.query(`delete from ${table} where user_id in ($1,$2)`,[uid,other]);
 await c.query('delete from auth.users where id in ($1,$2)',[uid,other]);
}
run('remediation: concurrent rejected requests commit exactly one shared quota without exception rollback',async()=>{
 const admin=await connection();const clients=await Promise.all(Array.from({length:5},connection));
 try{
  await setup(admin);for(const c of clients)await identity(c);
  for(const scenario of ['invalid','conflict','unauthorized']){
   await admin.query('delete from mapsilip_private.push_rate_limits where user_id=$1',[uid]);
   if(scenario==='conflict')assert.equal((await enroll(clients[0],1,undefined,prefs)).available,true);
   if(scenario==='unauthorized')await admin.query("update public.tenant_profiles set status='inactive' where user_id=$1",[uid]);
   const results=await Promise.all(Array.from({length:25},(_,i)=>scenario==='invalid'
    ?clients[i%5].query('select public.mapsilip_push_subscription_upsert($1,$2,null) v',[{...sub(2),endpoint:'https://localhost/x'},'a'.repeat(64)]).then(r=>r.rows[0].v)
    :enroll(clients[i%5],1,undefined,scenario==='conflict'?prefs:null)));
   assert.equal(results.filter(r=>r.push_error==='P0429').length,scenario==='conflict'?16:15);
   assert.equal(results.filter(r=>r.push_error===(scenario==='invalid'?'22023':scenario==='conflict'?'P0409':'42501')).length,scenario==='conflict'?9:10);
   assert.equal((await admin.query("select attempts from mapsilip_private.push_rate_limits where user_id=$1 and kind='subscription'",[uid])).rows[0].attempts,11);
  }
 }finally{await cleanup(admin);await Promise.all(clients.map(c=>c.end()));await admin.end()}
});
run('remediation: capability serializes different accounts/endpoints/sessions and simultaneous account switching',async()=>{
 const admin=await connection(),one=await connection(),two=await connection();
 const alternate='ffffffff-ffff-4fff-8fff-ffffffffffff';const barrier=782391425;
 try{
  await setup(admin);await admin.query('insert into auth.sessions(id,user_id) values($1,$2)',[alternate,uid]);
  await admin.query('insert into mapsilip_private.push_preferences(user_id,enabled,categories,initialized_at) values($1,true,$3,now()),($2,true,$3,now())',[uid,other,prefs.categories]);
  await admin.query(`create function mapsilip_private.push_test_barrier() returns trigger language plpgsql as $$begin perform pg_advisory_xact_lock(${barrier}); return new; end$$;
   create trigger push_test_barrier before insert on mapsilip_private.push_subscriptions for each row execute function mapsilip_private.push_test_barrier()`);
  for(let scenario=0;scenario<4;scenario++){
   const cap=(scenario+10).toString(16).repeat(64);
   await admin.query('delete from mapsilip_private.push_rate_limits where user_id in($1,$2)',[uid,other]);
   const sameAccount=scenario===2;const sameEndpoint=scenario===1||scenario===2;
   let previous;
   if(scenario===3){await identity(admin);await enroll(admin,'switch-old',cap);await admin.query('reset role');await notice(admin);const queued=(await admin.query('select public.mapsilip_push_claim(20) v')).rows[0].v;
    const row=(await admin.query("select d.id from mapsilip_private.push_deliveries d join mapsilip_private.push_subscriptions s on s.id=d.subscription_id where s.endpoint=$1 order by d.next_attempt_at desc limit 1",[sub('switch-old').endpoint])).rows[0];previous=queued.find(claim=>claim.id===row.id);assert.ok(previous)}
   await admin.query('select pg_advisory_lock($1)',[barrier]);
   const begin=async(c,user,session,n)=>{await c.query('begin');try{await identity(c,user,session);const response=await enroll(c,n,cap);await c.query('commit');return response}catch(e){await c.query('rollback');throw e}};
   const first=begin(one,uid,sid,'cap-'+scenario+'a');
   const second=begin(two,sameAccount?uid:other,sameAccount?alternate:secondSid,'cap-'+scenario+(sameEndpoint?'a':'b'));
   let blocked=false;
   for(let i=0;i<150&&!blocked;i++){const r=await admin.query('select cardinality(pg_blocking_pids($1))>0 and cardinality(pg_blocking_pids($2))>0 as blocked',[one.processID,two.processID]);blocked=r.rows[0].blocked;if(!blocked)await new Promise(r=>setTimeout(r,5))}
   await admin.query('select pg_advisory_unlock($1)',[barrier]);
   const responses=await Promise.all([first,second]);assert.equal(blocked,true);assert.ok(responses.every(r=>r.available===true));
   const bindings=(await admin.query("select user_id,auth_session_id from mapsilip_private.push_subscriptions where installation_hash=encode(sha256(convert_to($1,'UTF8')),'hex') and enabled",[cap])).rows;
   assert.equal(bindings.length,1,'one installation cannot have two active owners/endpoints');
   assert.ok([uid,other].includes(bindings[0].user_id));
   if(previous)assert.equal((await admin.query('select public.mapsilip_push_delivery_check($1,$2) v',[previous.id,previous.token])).rows[0].v,null);
   await admin.query('reset role');
  }
  assert.ok(Number((await admin.query('select count(distinct installation_hash) n from mapsilip_private.push_subscriptions where enabled')).rows[0].n)>=4,'different installations remain enrolled');
 }finally{
  await admin.query('select pg_advisory_unlock($1)',[barrier]);await one.query('rollback');await two.query('rollback');
  await admin.query('drop trigger if exists push_test_barrier on mapsilip_private.push_subscriptions; drop function if exists mapsilip_private.push_test_barrier()');
  // Remove only this test's synthetic notices; never use this fixture against hosted Supabase.
  await admin.query('delete from public.notifications where recipient_id in($1,$2)',[uid,other]);
  await cleanup(admin);await Promise.all([one.end(),two.end(),admin.end()]);
 }
});

run('remediation: concurrent pause/resume defers valid work, reclaims leases and keeps invalid subscriptions discarded',async()=>{
 const admin=await connection(),worker=await connection();try{
 await setup(admin);await identity(admin);await enroll(admin,1,undefined,prefs);await identity(admin,other,secondSid);await enroll(admin,2,'b'.repeat(64),prefs);await admin.query('reset role');
 await notice(admin);await notice(admin,other);
 const simultaneous=await Promise.all([admin.query('select public.mapsilip_push_claim(20) v'),worker.query('select public.mapsilip_push_claim(20) v')]);
 const claims=simultaneous.flatMap(result=>result.rows[0].v);assert.equal(claims.length,2);assert.equal(new Set(claims.map(claim=>claim.id)).size,2);
 assert.equal((await worker.query('select public.mapsilip_push_claim(20) v')).rows[0].v.length,0);
 await admin.query("select public.mapsilip_push_finish($1,$2,'configuration',0,0)",[claims[0].id,claims[0].token]);
 assert.equal((await admin.query('select status from mapsilip_private.push_deliveries where id=$1',[claims[0].id])).rows[0].status,'pending');
 await admin.query('update mapsilip_test.availability set available=false');
 assert.equal((await worker.query('select public.mapsilip_push_claim(20) v')).rows[0].v.length,0);
 assert.equal((await worker.query('select public.mapsilip_push_delivery_check($1,$2) v',[claims[1].id,claims[1].token])).rows[0].v.deferred,true);
 await admin.query("update mapsilip_private.push_deliveries set status='leased',claim_token=$2,lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where id=$1",[claims[1].id,secondSid]);
 await admin.query("update mapsilip_private.push_deliveries set next_attempt_at=now()-interval '1 second' where id=$1",[claims[0].id]);
 await admin.query('update mapsilip_test.availability set available=true');
 const resumed=(await worker.query('select public.mapsilip_push_claim(20) v')).rows[0].v;assert.equal(resumed.length,2);
 await admin.query("select public.mapsilip_push_finish($1,$2,'accepted',201,0)",[claims[1].id,secondSid]);
 assert.equal((await admin.query('select status from mapsilip_private.push_deliveries where id=$1',[claims[1].id])).rows[0].status,'leased');
 await worker.query("select public.mapsilip_push_finish($1,$2,'invalid_subscription',403,0)",[resumed[0].id,resumed[0].token]);
 await admin.query('update mapsilip_test.availability set available=false');
 await worker.query('select public.mapsilip_push_delivery_check($1,$2)',[resumed[1].id,resumed[1].token]);
 assert.equal((await admin.query('select status from mapsilip_private.push_deliveries where id=$1',[resumed[0].id])).rows[0].status,'discarded');
 await admin.query('update mapsilip_test.availability set available=true');
 await admin.query("update mapsilip_private.push_deliveries set next_attempt_at=now()-interval '1 second' where id=$1",[resumed[1].id]);
 assert.equal((await worker.query('select public.mapsilip_push_claim(20) v')).rows[0].v.length,1);
 assert.equal((await admin.query('select enabled from mapsilip_private.push_runtime')).rows[0].enabled,false);
 }finally{await admin.query('update mapsilip_test.availability set available=true');await admin.query('delete from public.notifications where recipient_id in($1,$2)',[uid,other]);await cleanup(admin);await Promise.all([worker.end(),admin.end()])}
});

run('remediation: unsent reservations are refunded once; sent attempts and stale tokens cannot be refunded',async()=>{
 const c=await connection();try{await c.query('begin');await setup(c);await identity(c);await enroll(c,1,undefined,prefs);await c.query('reset role');await notice(c);
 let claim=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v[0];
 for(let iteration=0;iteration<6;iteration++){
  assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[claim.id,claim.token])).rows[0].v.attempt,1);
  await c.query('select public.mapsilip_push_release($1)',[JSON.stringify([{...claim,sent:false}])]);
  assert.equal((await c.query('select attempts from mapsilip_private.push_deliveries where id=$1',[claim.id])).rows[0].attempts,0);
  await c.query("update mapsilip_private.push_deliveries set next_attempt_at=now()-interval '1 second' where id=$1",[claim.id]);
  claim=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v[0];
 }
 await c.query('select public.mapsilip_push_delivery_check($1,$2)',[claim.id,claim.token]);
 await c.query('select public.mapsilip_push_release($1)',[JSON.stringify([{...claim,token:secondSid,sent:false}])]);
 assert.equal((await c.query('select attempts from mapsilip_private.push_deliveries where id=$1',[claim.id])).rows[0].attempts,1);
 await c.query('select public.mapsilip_push_release($1)',[JSON.stringify([{...claim,sent:true}])]);
 assert.equal((await c.query('select attempts from mapsilip_private.push_deliveries where id=$1',[claim.id])).rows[0].attempts,1);
 }finally{await c.query('rollback');await c.end()}
});
run('remediation: endpoint quarantine updates only the current delivery; other queued rows stay safely bounded',async()=>{
 const c=await connection();try{await c.query('begin');await setup(c);await identity(c);await enroll(c,1,undefined,prefs);await c.query('reset role');
 await notice(c);const claim=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v[0];
 const data=(await c.query('select subscription_id,subscription_generation from mapsilip_private.push_deliveries where id=$1',[claim.id])).rows[0];
 for(let i=0;i<30;i++){
  const id=await notice(c);
  await c.query('insert into mapsilip_private.push_deliveries(outbox_id,subscription_id,subscription_generation) select id,$2,$3 from mapsilip_private.push_outbox where notification_id=$1',[id,data.subscription_id,data.subscription_generation]);
 }
 await c.query("select public.mapsilip_push_finish($1,$2,'invalid_subscription',403,0)",[claim.id,claim.token]);
 assert.equal(Number((await c.query("select count(*) n from mapsilip_private.push_deliveries where status='discarded'")).rows[0].n),1);
 assert.equal((await c.query('select mapsilip_private.push_is_enabled() v')).rows[0].v,true);
 assert.equal((await c.query('select enabled from mapsilip_private.push_subscriptions where id=$1',[data.subscription_id])).rows[0].enabled,false);
 const batch=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v;assert.ok(batch.length<=20);
 for(const work of batch)assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[work.id,work.token])).rows[0].v,null);
 }finally{await c.query('rollback');await c.end()}
});

run('remediation: worker RPC timeout metadata is scoped and locked work aborts without losing its lease',async()=>{
 const admin=await connection(),blocker=await connection(),worker=await connection();try{
 const functions=(await admin.query("select proname,proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('mapsilip_push_claim','mapsilip_push_delivery_check','mapsilip_push_finish','mapsilip_push_release')")).rows;
 assert.equal(functions.length,4);for(const fn of functions){assert.ok(fn.proconfig.includes('statement_timeout=2s'));assert.ok(fn.proconfig.includes('lock_timeout=1s'))}
 await setup(admin);await identity(admin);await enroll(admin,1,undefined,prefs);await admin.query('reset role');await notice(admin);
 const claim=(await admin.query('select public.mapsilip_push_claim(20) v')).rows[0].v[0];
 await blocker.query('begin');await blocker.query('select id from mapsilip_private.push_deliveries where id=$1 for update',[claim.id]);
 const started=Date.now();await assert.rejects(worker.query('select public.mapsilip_push_delivery_check($1,$2)',[claim.id,claim.token]),e=>['55P03','57014'].includes(e.code));assert.ok(Date.now()-started<2500);
 await blocker.query('rollback');
 assert.equal((await admin.query('select status from mapsilip_private.push_deliveries where id=$1',[claim.id])).rows[0].status,'leased');
 await worker.query('select public.mapsilip_push_release($1)',[JSON.stringify([{...claim,sent:false}])]);
 assert.equal((await admin.query('select status from mapsilip_private.push_deliveries where id=$1',[claim.id])).rows[0].status,'pending');
 }finally{await blocker.query('rollback');await admin.query('delete from public.notifications where recipient_id in($1,$2)',[uid,other]);await cleanup(admin);await Promise.all([blocker.end(),worker.end(),admin.end()])}
});
