import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
const url=process.env.MAPSILIP_PUSH_TEST_DATABASE_URL;
const run=url?test:test.skip;
run('isolated database: grants, account preferences, ownership and session revocation',async()=>{
 const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.ok(['55439','55440'].includes(target.port));
 const c=new pg.Client({connectionString:url});await c.connect();
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 const sa='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sb='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const prefs={enabled:true,categories:{payments:true,maintenance:true,accounts:true,visitors:true,concerns:false}};
 const sub={endpoint:'https://web.push.apple.com/test-device-a',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}};
 async function as(uid,sid,sql,args=[]){await c.query('set role authenticated');await c.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:uid,session_id:sid})]);try{return await c.query(sql,args)}finally{await c.query('reset role')}}
 try {
 await c.query('begin');
 await c.query("insert into auth.users(id,email,email_confirmed_at) values($1,'a@example.invalid',now()),($2,'b@example.invalid',now()) on conflict do nothing",[a,b]);
 await c.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4) on conflict do nothing',[sa,a,sb,b]);
 await c.query("insert into public.tenant_profiles(user_id,display_name) values($1,'Synthetic A'),($2,'Synthetic B') on conflict do nothing",[a,b]);
 await c.query("select set_config('mapsilip_test.push_paused','false',false)");
 const caps='a'.repeat(64),capb='b'.repeat(64);
 await as(a,sa,'select public.mapsilip_push_subscription_upsert($1,$2,$3)',[sub,caps,prefs]);
 let saved=(await as(a,sa,'select public.mapsilip_push_preferences_get() as v')).rows[0].v;
 assert.equal(saved.initialized,true);assert.equal(saved.preferences.categories.concerns,false);
 // Additional enrollment must preserve even a concurrently changed category.
 prefs.categories.payments=false;
 await as(a,sa,'select public.mapsilip_push_preferences_set($1)',[prefs]);
 await as(a,sa,'select public.mapsilip_push_subscription_upsert($1,$2,null)',[{...sub,endpoint:'https://web.push.apple.com/test-device-a2'},'c'.repeat(64)]);
 saved=(await as(a,sa,'select public.mapsilip_push_preferences_get() as v')).rows[0].v;
 assert.equal(saved.preferences.categories.payments,false);
 // Expected errors use savepoints to keep the transaction usable.
 async function denied(fn){
  await c.query('savepoint expected');let result,error;
  try{result=await fn()}catch(caught){error=caught}
  if(error){assert.ok(error.code);await c.query('rollback to savepoint expected')}
  else assert.ok(Object.values(result.rows[0])[0]?.push_error);
  await c.query('reset role');
 }
 await denied(()=>as(a,sa,'select public.mapsilip_push_subscription_upsert($1,$2,$3)',[sub,caps,prefs]));
 await denied(()=>as(b,sb,'select public.mapsilip_push_subscription_upsert($1,$2,$3)',[sub,capb,prefs]));
 await denied(()=>as(a,sa,'select * from mapsilip_private.push_subscriptions'));
 await denied(()=>as(a,sa,'select public.mapsilip_push_claim(20)'));
 await c.query('set role anon');await denied(()=>c.query('select public.mapsilip_push_preferences_get()'));await c.query('reset role');
 await denied(()=>as(a,sa,'select public.mapsilip_push_subscription_upsert($1,$2,null)',[{...sub,endpoint:'https://localhost/private'},caps]));
 // SQL classifier rejects unknown suffixes and suppresses duplicate activation notices.
 assert.equal((await c.query("select mapsilip_private.push_classify($1) c",['maintenance:'+a+':resolved'])).rows[0].c,'maintenance');
 assert.equal((await c.query("select mapsilip_private.push_classify($1) c",['account-request:'+a+':activated'])).rows[0].c,null);
 assert.equal((await c.query("select mapsilip_private.push_classify($1) c",['maintenance:'+a+':invented'])).rows[0].c,null);
 await c.query("insert into public.notifications(recipient_id,title,body,href,event_key) values($1,'Test','Synthetic','/tenant/maintenance',$2)",[a,'maintenance:'+a+':resolved']);
 let claims=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v;
 assert.equal(claims.length,2);
 // Repeated claims do not take a live lease; stale tokens cannot finish it.
 assert.equal((await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v.length,0);
 let first=claims[0];
 const oldToken=first.token;
 await c.query("update mapsilip_private.push_deliveries set lease_until=now()-interval '1 second' where id=$1",[first.id]);
 first=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v[0];
 assert.notEqual(first.token,oldToken);
 await c.query("select public.mapsilip_push_finish($1,$2,'accepted',201,0)",[first.id,oldToken]);

 await c.query("select public.mapsilip_push_finish($1,$2,'accepted',201,0)",[first.id,sb]);
 assert.equal((await c.query('select status from mapsilip_private.push_deliveries where id=$1',[first.id])).rows[0].status,'leased');
 const delivery=(await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[first.id,first.token])).rows[0].v;
 assert.equal(delivery.category,'maintenance');assert.equal(delivery.attempt,1);
 await c.query("select public.mapsilip_push_finish($1,$2,'retry',503,30)",[first.id,first.token]);
 const retry=(await c.query("select status,next_attempt_at>=now()+interval '30 seconds' as delayed from mapsilip_private.push_deliveries where id=$1",[first.id])).rows[0];
 assert.equal(retry.status,'pending');assert.equal(retry.delayed,true);
 await c.query("update mapsilip_private.push_deliveries set next_attempt_at=now()-interval '1 second' where id=$1",[first.id]);
 first=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v[0];
 assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[first.id,first.token])).rows[0].v.attempt,2);
 await c.query("select public.mapsilip_push_finish($1,$2,'gone',410,0)",[first.id,first.token]);
 assert.equal((await c.query('select enabled from mapsilip_private.push_subscriptions where id=(select subscription_id from mapsilip_private.push_deliveries where id=$1)',[first.id])).rows[0].enabled,false);
 // Master/category change while another delivery is leased must stop its send.
 prefs.enabled=false;
 await as(a,sa,'select public.mapsilip_push_preferences_set($1)',[prefs]);
 const second=claims[1];
 assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[second.id,second.token])).rows[0].v,null);
 // Exercise SQL max-attempt and original-notice expiry guards separately.
 await c.query('update mapsilip_private.push_preferences set enabled=true where user_id=$1',[a]);
 await c.query("update mapsilip_private.push_deliveries set status='leased',claim_token=$2,lease_until=now()+interval '60 seconds',attempts=5 where id=$1",[second.id,sb]);
 assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[second.id,sb])).rows[0].v,null);
 await c.query("update mapsilip_private.push_deliveries set status='leased',claim_token=$2,lease_until=now()+interval '60 seconds',attempts=0 where id=$1",[second.id,sb]);
 await c.query("update mapsilip_private.push_outbox set expires_at=now()-interval '1 second' where id=(select outbox_id from mapsilip_private.push_deliveries where id=$1)",[second.id]);
 assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[second.id,sb])).rows[0].v,null);
 await c.query('update mapsilip_private.push_preferences set enabled=false where user_id=$1',[a]);
 // Staff enrollment uses the actual admitted security revision; a revision change invalidates worker eligibility.
 await c.query("insert into mapsilip_private.accounts(user_id,role,status,password_change_required) values($1,'caretaker','active',false)",[b]);
 await c.query('insert into mapsilip_private.session_admissions(user_id,auth_session_id,security_revision) values($1,$2,1)',[b,sb]);
 prefs.enabled=true;
 await as(b,sb,'select public.mapsilip_push_subscription_upsert($1,$2,$3)',[{...sub,endpoint:'https://web.push.apple.com/test-staff'},capb,prefs]);
 await c.query("insert into public.notifications(recipient_id,title,body,href,event_key) values($1,'Test','Synthetic','/caretaker/maintenance',$2)",[b,'maintenance:'+b+':resolved']);
 const staffClaim=(await c.query('select public.mapsilip_push_claim(20) v')).rows[0].v[0];assert.ok(staffClaim);
 await c.query("update mapsilip_private.accounts set status='deactivated' where user_id=$1",[b]);
 assert.equal((await c.query('select public.mapsilip_push_delivery_check($1,$2) v',[staffClaim.id,staffClaim.token])).rows[0].v,null);
 await denied(()=>as(b,sb,'select public.mapsilip_push_preferences_get()'));
 await c.query("update public.tenant_profiles set status='inactive' where user_id=$1",[a]);
 await denied(()=>as(a,sa,'select public.mapsilip_push_preferences_get()'));
 await c.query("update public.tenant_profiles set status='active' where user_id=$1",[a]);
 await c.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[a]);
 await denied(()=>as(a,sa,'select public.mapsilip_push_preferences_get()'));
 await c.query('update auth.users set banned_until=null where id=$1',[a]);
 // Removal of the authenticated session invalidates direct RPC access.
 await c.query('delete from auth.sessions where id=$1',[sa]);
 await denied(()=>as(a,sa,'select public.mapsilip_push_preferences_get()'));
 await c.query('rollback');
 } finally {await c.query('rollback').catch(()=>{});await c.end()}
});

run('isolated database: concurrent first devices initialize preferences exactly once',async()=>{
 const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.ok(['55439','55440'].includes(target.port));
 const admin=new pg.Client({connectionString:url}),one=new pg.Client({connectionString:url}),two=new pg.Client({connectionString:url});
 await Promise.all([admin.connect(),one.connect(),two.connect()]);
 const uid='33333333-3333-4333-8333-333333333333',sid='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 const prefs={enabled:true,categories:{payments:true,maintenance:true,accounts:true,visitors:true,concerns:false}};
 const sub=n=>({endpoint:'https://web.push.apple.com/concurrent-'+n,keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64)]).toString('base64url'),auth:Buffer.alloc(16).toString('base64url')}});
 try {
  await admin.query("insert into auth.users(id,email,email_confirmed_at) values($1,'race@example.invalid',now())",[uid]);
  await admin.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
  await admin.query("insert into public.tenant_profiles(user_id,display_name) values($1,'Synthetic race')",[uid]);
  await admin.query("select set_config('mapsilip_test.push_paused','false',false)");
  for(const c of [one,two]){await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:uid,session_id:sid})])}
  await one.query('select public.mapsilip_push_subscription_upsert($1,$2,$3)',[sub(1),'d'.repeat(64),prefs]);
  const loser=two.query('select public.mapsilip_push_subscription_upsert($1,$2,$3)',[sub(2),'e'.repeat(64),{...prefs,categories:{...prefs.categories,concerns:true}}]);
  const rejected=loser.then(result=>assert.equal(Object.values(result.rows[0])[0].push_error,'P0409'));
  let blocked=false;
  for(let i=0;i<100&&!blocked;i++){blocked=(await admin.query('select cardinality(pg_blocking_pids($1))>0 as blocked',[two.processID])).rows[0].blocked;if(!blocked)await new Promise(r=>setTimeout(r,5))}
  assert.equal(blocked,true,'second first-enrollment waits on the same authoritative account lock');
  await one.query('commit');await rejected;await two.query('rollback');
  assert.equal((await admin.query('select categories from mapsilip_private.push_preferences where user_id=$1',[uid])).rows[0].categories.concerns,false);
  assert.equal(Number((await admin.query('select count(*) n from mapsilip_private.push_subscriptions where user_id=$1',[uid])).rows[0].n),1);
 } finally {
  await one.query('rollback').catch(()=>{});await two.query('rollback').catch(()=>{});
  await admin.query('delete from mapsilip_private.push_subscriptions where user_id=$1',[uid]);
  await admin.query('delete from mapsilip_private.push_preferences where user_id=$1',[uid]);
  await admin.query('delete from mapsilip_private.push_rate_limits where user_id=$1',[uid]);
  await admin.query('delete from public.tenant_profiles where user_id=$1',[uid]);
  await admin.query('delete from auth.sessions where user_id=$1',[uid]);
  await admin.query('delete from auth.users where id=$1',[uid]);
  await admin.query("select set_config('mapsilip_test.push_paused','true',false)");
  await Promise.all([one.end(),two.end(),admin.end()]);
 }
});
