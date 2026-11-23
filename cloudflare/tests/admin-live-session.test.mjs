import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {issueAdminSession,verifyAdminSession,handleAdminSessionApi} from '../src/modules/admin/admin-auth.js';

function setup(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,created_at INTEGER,expires_at INTEGER,revoked_at INTEGER,last_seen_at INTEGER)');
 const DB={prepare:sql=>{
  const run=(args=[])=>({
   first:async()=>sqlite.prepare(sql).get(...args)||null,
   run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}}),
  });
  return {...run(),bind:(...args)=>run(args)};
 }};
 const env={DB,V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'very-long-testing-secret'};
 const req=(token,method='GET',path='/api/chat/admin/auth/heartbeat')=>{
  const url=new URL('https://test.example'+path);
  return handleAdminSessionApi(new Request(url,{method,headers:{Authorization:'Bearer '+token}}),
   env,url,'',(body,status)=>new Response(JSON.stringify(body),{status}));
 };
 return {env,sqlite,req};
}
test('An open administrator keeps one session alive via heartbeat and dormant bearer expires',async()=>{
 const {env,sqlite,req}=setup();
 const session=await issueAdminSession(env);
 const request=new Request('https://test.example/',{headers:{Authorization:'Bearer '+session.token}});
 assert.equal(await verifyAdminSession(request,env),true);
 assert.equal((await req(session.token,'POST')).status,200);
 // Rewind last activity, simulating Android killing the app without an unload event.
 sqlite.exec('UPDATE chat_admin_sessions SET last_seen_at=0');
 assert.equal(await verifyAdminSession(request,env),false);
 assert.equal((await req(session.token,'POST')).status,401);
 const next=await issueAdminSession(env);
 assert.equal(await verifyAdminSession(
  new Request('https://test.example/',{headers:{Authorization:'Bearer '+next.token}}),env),true);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM chat_admin_sessions WHERE revoked_at IS NULL').get().n,1);
});
