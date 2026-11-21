import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {issueAdminSession} from '../src/modules/admin/admin-auth.js';
import {handleAdminTrustedDevice} from '../src/modules/admin/admin-trusted-device.js';

const ORIGIN='https://havana-nice-v2.pages.dev';
const HOST='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const id=()=>crypto.randomUUID();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes)))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
function makeDb(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec('CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER)');
 db.exec(readFileSync(new URL('../migrations/0035_admin_trusted_devices.sql',import.meta.url),'utf8'));
 const statement=(sql,params)=>({
  first:async()=>db.prepare(sql).get(...params)||null,
  run:async()=>({meta:{changes:db.prepare(sql).run(...params).changes}}),
  all:async()=>({results:db.prepare(sql).all(...params)})
 });
 const env={V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'test-only-strong-private-secret',
  DB:{prepare:sql=>({...statement(sql,[]),bind:(...params)=>statement(sql,params)})}};
 const req=async(path,data,token='',otherOrigin=ORIGIN)=>{
  const request=new Request(HOST+path,{method:'POST',
   headers:{Origin:otherOrigin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
   body:JSON.stringify(data)});
  return handleAdminTrustedDevice(request,env,new URL(request.url),otherOrigin,
   (body,status)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
 };
 return {env,db,req};
}
test('Admin device enrollment requires existing private session and official origin',async()=>{
 const {env,req}=makeDb(),deviceId=id(),pair=await crypto.subtle.generateKey(
  {name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 const k=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const data={deviceId,publicKey:{kty:k.kty,crv:k.crv,x:k.x,y:k.y}};
 assert.equal((await req('/api/chat/admin/auth/device/enroll',data)).status,401);
 const session=await issueAdminSession(env);
 assert.equal((await req('/api/chat/admin/auth/device/enroll',data,session.token,'https://malicious.example')).status,403);
 assert.equal((await req('/api/chat/admin/auth/device/enroll',data,session.token)).status,200);
 assert.equal((await req('/api/chat/admin/auth/device/enroll',data,session.token)).status,409);
});
test('The bound non-extractable browser key signs an expiring one-use challenge',async()=>{
 const {env,req}=makeDb(),deviceId=id();
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
 assert.equal(pair.privateKey.extractable,false);
 const k=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const session=await issueAdminSession(env);
 assert.equal((await req('/api/chat/admin/auth/device/enroll',{
  deviceId,publicKey:{kty:k.kty,crv:k.crv,x:k.x,y:k.y}
 },session.token)).status,200);
 const challengeResponse=await req('/api/chat/admin/auth/device/challenge',{deviceId});
 assert.equal(challengeResponse.status,200);
 const challenge=await challengeResponse.json();
 const message=new TextEncoder().encode('havana-nice-v2-admin-device-v1\n'+
  challenge.challengeId+'\n'+challenge.challenge+'\n'+ORIGIN);
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,message);
 const payload={deviceId,...challenge,signature:b64(signature)};
 assert.equal((await req('/api/chat/admin/auth/device/session',{...payload,
  challenge:'A'.repeat(43)})).status,401);
 // Invalid attempt consumed the challenge, protecting against reuse.
 assert.equal((await req('/api/chat/admin/auth/device/session',payload)).status,401);
 const second=await (await req('/api/chat/admin/auth/device/challenge',{deviceId})).json();
 const signed=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,
  new TextEncoder().encode('havana-nice-v2-admin-device-v1\n'+
   second.challengeId+'\n'+second.challenge+'\n'+ORIGIN));
 const response=await req('/api/chat/admin/auth/device/session',{
  deviceId,...second,signature:b64(signed)
 });
 assert.equal(response.status,200);
 const newSession=await response.json();
 assert.ok(newSession.token.length>=40);
 assert.equal((await req('/api/chat/admin/auth/device/session',{
  deviceId,...second,signature:b64(signed)})).status,401);
 assert.equal((await req('/api/chat/admin/auth/device/revoke',{deviceId},session.token)).status,200);
 assert.equal((await req('/api/chat/admin/auth/device/challenge',{deviceId})).status,401);
});
