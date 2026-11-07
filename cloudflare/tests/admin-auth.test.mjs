import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {adminLoginConfigured,handleAdminSessionApi,verifyAdminSession} from '../src/modules/admin/admin-auth.js';

const adminPassword='secure-admin-test-'+ 'Z'.repeat(48);
const endpoint='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
class FakeD1 {
 constructor(){this.sessions=new Map();this.attempts=new Map();}
 prepare(sql){
  return {bind:(...args)=>({first:async()=>this.first(sql,args),run:async()=>this.run(sql,args),sql,args})};
 }
 async batch(statements){
  const changes=[];
  for(const {sql,args} of statements){
   let count=0;
   if(sql.startsWith('DELETE FROM chat_admin_sessions WHERE expires_at<=')){
    for(const [key,row] of this.sessions){
     if(row.expires_at<=args[0]||row.revoked_at!==null){this.sessions.delete(key);count++;}
    }
   }else if(sql.startsWith('DELETE FROM chat_admin_login_limits WHERE window_start<')){
    for(const [key,row] of this.attempts){
     if(row.window_start<args[0]){this.attempts.delete(key);count++;}
    }
   }else throw Error('Unexpected cleanup SQL '+sql);
   changes.push({meta:{changes:count}});
  }
  return changes;
 }
 async first(sql,p){
  if(sql.startsWith('SELECT failures,window_start')) return this.attempts.get(p[0])||null;
  if(sql.startsWith('SELECT expires_at,revoked_at'))return this.sessions.get(p[0])||null;
  if(sql.startsWith('SELECT COUNT(*) AS others FROM chat_admin_sessions')){
    return {others:[...this.sessions.entries()].filter(([key,row])=>key!==p[1]&&row.revoked_at===null&&row.expires_at>p[0]).length};
  }
  throw Error('Unexpected read '+sql);
 }
 async run(sql,p){
  if(sql.startsWith('INSERT INTO chat_admin_login_limits')){
    const old=this.attempts.get(p[0]);
    const fresh=!old||old.window_start<p[2];
    this.attempts.set(p[0],{window_start:fresh?p[1]:old.window_start,failures:fresh?1:old.failures+1});
    return {meta:{changes:1}};
  }
  if(sql.startsWith('DELETE FROM chat_admin_login_limits')){
    this.attempts.delete(p[0]);return {meta:{changes:1}};
  }
  if(sql.startsWith('INSERT INTO chat_admin_sessions')){
    this.sessions.set(p[0],{expires_at:p[2],revoked_at:null});
    return {meta:{changes:1}};
  }
  if(sql.startsWith('UPDATE chat_admin_sessions')){
    if(sql.includes('token_hash<>?')){
      let changes=0;
      for(const [key,row] of this.sessions){
        if(key!==p[2]&&row.revoked_at===null&&row.expires_at>p[1]){
          row.revoked_at=p[0];changes++;
        }
      }
      return {meta:{changes}};
    }
    const row=this.sessions.get(p[1]);if(row)row.revoked_at=p[0];
    return {meta:{changes:row?1:0}};
  }
  throw Error('Unexpected write '+sql);
 }
}
const env=()=>({V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:adminPassword,DB:new FakeD1()});
const request=(method,path,body,token,ip='198.51.100.3')=>{
 const headers={'content-type':'application/json','cf-connecting-ip':ip};
 if(token)headers.authorization='Bearer '+token;
 return new Request(endpoint+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
};
async function fetchAdmin(env,method='GET',path='/api/chat/admin/auth/status',body,token,ip){
 const req=request(method,path,body,token,ip);
 const res=await handleAdminSessionApi(req,env,new URL(req.url),'',(value,status=200)=>new Response(JSON.stringify(value),{status}));
 return {status:res.status,data:await res.json()};
}

test('no administrator auth without explicit server enable flag',async()=>{
 const e=env();delete e.V2_ADMIN_LOGIN_MODE;
 assert.equal(adminLoginConfigured(e),false);
 assert.deepEqual(await fetchAdmin(e),{status:200,data:{enabled:false}});
 const attempt=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:adminPassword});
 assert.equal(attempt.status,503);
 assert.equal(e.DB.sessions.size,0);
});
test('human-chosen Administrator password accepts eight characters without disabling login',async()=>{
 const e=env();e.V2_ADMIN_LOGIN_SECRET='Short8!x';
 assert.equal(adminLoginConfigured(e),true);
 assert.deepEqual(await fetchAdmin(e),{status:200,data:{enabled:true}});
 const logged=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:'Short8!x'});
 assert.equal(logged.status,200);
 assert.equal(logged.data.role,'chat-admin');
 assert.ok(logged.data.token.length>=40,'Bearer tokens stay high entropy');
 assert.notEqual(logged.data.token,'Short8!x');
 assert.equal((await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:'incorrect'})).status,401);
});
test('administrator secret shorter than eight stays disabled for security',async()=>{
 const e=env();e.V2_ADMIN_LOGIN_SECRET='1234567';
 assert.equal(adminLoginConfigured(e),false);
 assert.deepEqual(await fetchAdmin(e),{status:200,data:{enabled:false}});
 assert.equal((await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:'1234567'})).status,503);
});
test('a musician name or token is not an administrator credential',async()=>{
 const e=env();
 assert.equal(await verifyAdminSession(request('GET','/x',undefined,'member:noa'),e),false);
 const bad=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:'Noa'});
 assert.equal(bad.status,401);
 assert.equal(e.DB.sessions.size,0);
});
test('authentication creates an expiring D1-backed admin token, revocable by logout',async()=>{
 const e=env();
 assert.equal((await fetchAdmin(e)).data.enabled,true);
 const signed=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:adminPassword});
 assert.equal(signed.status,200);
 assert.equal(signed.data.role,'chat-admin');
 assert.ok(signed.data.token.length>=40);
 assert.notEqual(signed.data.token,adminPassword);
 assert.equal(e.DB.sessions.size,1);
 assert.ok(![...e.DB.sessions.keys()].includes(signed.data.token),'Only hashed tokens live in DB');
 const token=signed.data.token;
 assert.equal(await verifyAdminSession(request('GET','/x',undefined,token),e),true);
 assert.equal((await fetchAdmin(e,'GET','/api/chat/admin/auth/session',undefined,token)).status,200);
 assert.equal((await fetchAdmin(e,'DELETE','/api/chat/admin/auth/session',undefined,token)).status,200);
 assert.equal(await verifyAdminSession(request('GET','/x',undefined,token),e),false);
 assert.equal((await fetchAdmin(e,'GET','/api/chat/admin/auth/session',undefined,token)).status,401);
});
test('successful Admin login prunes only expired/revoked Admin credentials and stale attempts',async()=>{
 const e=env(),now=Date.now();
 e.DB.sessions.set('expired-session',{expires_at:now-1000,revoked_at:null});
 e.DB.sessions.set('revoked-session',{expires_at:now+100000,revoked_at:now-100});
 e.DB.sessions.set('valid-other-session',{expires_at:now+100000,revoked_at:null});
 e.DB.attempts.set('old-limit',{window_start:now-48*60*60*1000,failures:2});
 e.DB.attempts.set('recent-limit',{window_start:now-60*1000,failures:1});
 const logged=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:adminPassword});
 assert.equal(logged.status,200);
 assert.equal(e.DB.sessions.has('expired-session'),false);
 assert.equal(e.DB.sessions.has('revoked-session'),false);
 assert.equal(e.DB.sessions.has('valid-other-session'),true);
 assert.equal(e.DB.sessions.size,2,'retain previous live Admin and newly issued session');
 assert.equal(e.DB.attempts.has('old-limit'),false);
 assert.equal(e.DB.attempts.has('recent-limit'),true);
});

test('a temporary D1 housekeeping failure cannot block a valid Administrator login',async()=>{
 const e=env(),original=e.DB.batch.bind(e.DB);
 e.DB.batch=async()=>{throw Error('temporary D1 maintenance error');};
 const signed=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:adminPassword});
 assert.equal(signed.status,200);
 assert.equal(signed.data.role,'chat-admin');
 assert.equal(e.DB.sessions.size,1);
 assert.equal(await verifyAdminSession(request('GET','/x',undefined,signed.data.token),e),true);
 e.DB.batch=original;
});

test('five incorrect logins limit a single device but do not block another IP',async()=>{
 const e=env();
 for(let i=0;i<5;i++){
  const r=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:'incorrect'},
   undefined,'203.0.113.5');
  assert.equal(r.status,401);
 }
 const locked=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:adminPassword},
   undefined,'203.0.113.5');
 assert.equal(locked.status,429);
 const different=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:adminPassword},
   undefined,'203.0.113.8');
 assert.equal(different.status,200);
});

// S01/P04: member Chat sessions cannot subscribe to privileged admin changes.
import {adminSocketToken,adminTokenRequest,notifyAdminClients} from '../src/modules/admin/admin-realtime.js';
test('admin realtime subprotocol requires the independent administrator token and never URL parameters',()=>{
 const req=(protocol)=>new Request(endpoint+'/ws/admin',{headers:{'sec-websocket-protocol':protocol}});
 assert.equal(adminSocketToken(req('havana-v2-admin, admin.'+'a'.repeat(43))),'a'.repeat(43));
 assert.equal(adminSocketToken(req('havana-v2, session.'+'a'.repeat(43))),'');
 assert.equal(adminSocketToken(req('admin.'+'a'.repeat(43))),'');
 assert.equal(adminTokenRequest('a'.repeat(43)).headers.get('authorization'),'Bearer '+'a'.repeat(43));
});
test('admin invalidation sends topics only through private Durable Object binding',async()=>{
 const urls=[],events=[];
 const e={CHAT_ROOMS:{idFromName:n=>{assert.equal(n,'main-chat-v2');return n;},get:()=>({fetch:async(url,req)=>{urls.push(url);events.push(JSON.parse(req.body));return Response.json({ok:true});}})}};
 await notifyAdminClients(e,'members');
 await notifyAdminClients(e,'sensitive-musician-data');
 assert.deepEqual(events,[{topic:'members'}]);
 assert.deepEqual(urls,['https://internal/admin-invalidate']);
});
test('Worker rechecks admin sessions for WebSocket; DO keeps admin sockets out of Chat roster',()=>{
 const fs=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
 const worker=fs('../src/index.ts');
 assert.match(worker,/url\.pathname === '\/ws\/admin'/);
 assert.match(worker,/verifyAdminSession\(adminTokenRequest\(token\),env\)/);
 assert.match(worker,/verifyAdminSession\(adminTokenRequest\(token\),this\.env\)/);
 assert.match(worker,/this\.adminSockets = new Map/);
 assert.match(worker,/this\.members\.set\(server, \{actorId/);
});

test('Administrator can review and close ONLY other active sessions',async()=>{
 const e=env();
 const tokens=[];
 for(let i=0;i<3;i++){
   const signIn=await fetchAdmin(e,'POST','/api/chat/admin/auth/session',{password:adminPassword},
     undefined,'192.0.2.'+(10+i));
   assert.equal(signIn.status,200);
   tokens.push(signIn.data.token);
 }
 assert.equal(e.DB.sessions.size,3);
 const anonymous=await fetchAdmin(e,'GET','/api/chat/admin/auth/sessions');
 assert.equal(anonymous.status,401);
 const current=tokens[1];
 assert.deepEqual(await fetchAdmin(e,'GET','/api/chat/admin/auth/sessions',undefined,current),
   {status:200,data:{others:2}});
 const rejected=await fetchAdmin(e,'POST','/api/chat/admin/auth/revoke-others');
 assert.equal(rejected.status,401);
 const revoked=await fetchAdmin(e,'POST','/api/chat/admin/auth/revoke-others',undefined,current);
 assert.equal(revoked.status,200);
 assert.deepEqual(revoked.data,{ok:true,revoked:2});
 assert.equal(await verifyAdminSession(request('GET','/x',undefined,current),e),true);
 assert.equal(await verifyAdminSession(request('GET','/x',undefined,tokens[0]),e),false);
 assert.equal(await verifyAdminSession(request('GET','/x',undefined,tokens[2]),e),false);
 assert.deepEqual(await fetchAdmin(e,'GET','/api/chat/admin/auth/sessions',undefined,current),
   {status:200,data:{others:0}});
 const repeat=await fetchAdmin(e,'POST','/api/chat/admin/auth/revoke-others',undefined,current);
 assert.equal(repeat.status,200);
 assert.equal(repeat.data.revoked,0);
});
