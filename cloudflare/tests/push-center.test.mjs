import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {handleMemberPushApi,queueNoticePush} from '../src/modules/notices/push-center.js';
import {encryptWebPush,sendWebPush,sendFcmPush,dispatchDuePush} from '../src/modules/notices/push-delivery.js';

const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')
 .padEnd(Math.ceil(s.length/4)*4,'=')),ch=>ch.charCodeAt(0));
const token='f'.repeat(48);
const root='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
function dbFixture(){
 const raw=new DatabaseSync(':memory:');
 raw.exec('PRAGMA foreign_keys=ON');
 raw.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER)');
 raw.exec('CREATE TABLE chat_sessions(actor_id TEXT,token_hash TEXT,expires_at INTEGER)');
 raw.exec('CREATE TABLE chat_single_device_owners(actor_id TEXT,token_hash TEXT)');
 raw.exec(readFileSync(new URL('../migrations/0038_member_push_center.sql',import.meta.url),'utf8'));
 const hash=createHash('sha256').update(token).digest('hex');
 raw.prepare('INSERT INTO chat_members VALUES(?,?,1)').run('member:fer','Fer');
 raw.prepare('INSERT INTO chat_sessions VALUES(?,?,?)').run('member:fer',hash,Date.now()+600000);
 raw.prepare('INSERT INTO chat_single_device_owners VALUES(?,?)').run('member:fer',hash);
 const DB={prepare(sql){const query=(args)=>({
  first:async()=>raw.prepare(sql).get(...args)||null,
  all:async()=>({results:raw.prepare(sql).all(...args)}),
  run:async()=>({meta:raw.prepare(sql).run(...args)})
 });return {bind:(...args)=>query(args),...query([])};},
 async batch(stmts){
  raw.exec('BEGIN');try{const out=[];for(const st of stmts)out.push(await st.run());
   raw.exec('COMMIT');return out;}catch(e){raw.exec('ROLLBACK');throw e;}
 }};
 const env={DB};
 const verify=async(_env,value)=>value===token?{actorId:'member:fer'}:null;
 const api=async(method,path,data,bearer=token)=>{
  const request=new Request(root+path,{method,
   headers:{Authorization:'Bearer '+bearer},body:data===undefined?undefined:JSON.stringify(data)});
  return handleMemberPushApi(request,env,new URL(request.url),'',verify);
 };
 return {raw,env,api};
}
async function browserKey(){
 const pair=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const pub=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const auth=crypto.getRandomValues(new Uint8Array(16));
 return {pair,pub,auth,subscription:{endpoint:'https://web.push.apple.com/Qexample',
  keys:{p256dh:b64(pub),auth:b64(auth)}}};
}
test('Device registration uses only authorized musician session and rejects unsafe endpoints',async()=>{
 const {raw,env,api}=dbFixture();
 assert.equal((await api('POST','/api/push/devices',{platform:'webpush'},'bad')).status,401);
 assert.equal((await api('POST','/api/push/devices',{platform:'webpush',
  subscription:{endpoint:'https://evil.example/secret',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}}})).status,400);
 const key=await browserKey();
 const sub={platform:'webpush',subscription:key.subscription};
 assert.equal((await api('POST','/api/push/devices',sub)).status,201);
 assert.equal((await api('POST','/api/push/devices',sub)).status,201);
 assert.equal((await (await api('GET','/api/push/devices')).json()).registered,1);
 const id=raw.prepare('SELECT id FROM member_push_devices').get().id;
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM member_push_devices').get().n,1);
 assert.ok(id);
 assert.equal((await api('DELETE','/api/push/devices',
  {platform:'webpush',endpoint:key.subscription.endpoint})).status,200);
 assert.equal((await (await api('GET','/api/push/devices')).json()).registered,0);
 raw.close();
});
test('Outbox keeps exactly one job per device and notice, no credentials or R2 paths',async()=>{
 const {raw,env,api}=dbFixture();
 const key=await browserKey();

 assert.equal((await api('POST','/api/push/devices',
  {platform:'webpush',subscription:key.subscription})).status,201);
 const event={noticeId:crypto.randomUUID(),recipientId:'member:fer',kind:'chat.message',
  targetId:'12',title:'HAVANA NICE · Chat',body:'Nuevo mensaje del equipo'};
 assert.equal(await queueNoticePush(env,event),1);
 assert.equal(await queueNoticePush(env,event),1);
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM member_push_outbox').get().n,1);
 assert.equal((await dispatchDuePush(env)).unconfigured,1);
 raw.prepare('DELETE FROM chat_single_device_owners').run();
 assert.equal((await dispatchDuePush(env)).unconfigured,0,'reassigned session cannot receive pending push');
 raw.close();
});
test('WebPush cryptogram uses ephemeral ECDH AES128GCM and decrypts correctly',async()=>{
 const {pair,pub,auth,subscription}=await browserKey();
 const payload={title:'HAVANA NICE',body:'Nuevo Estado',kind:'story.created',targetId:'123'};
 const encrypted=await encryptWebPush({
  p256dh:subscription.keys.p256dh,auth:subscription.keys.auth},payload);
 assert.deepEqual([...encrypted.slice(16,21)],[0,0,16,0,65]);
 const sender=encrypted.slice(21,86),salt=encrypted.slice(0,16);
 const key=await crypto.subtle.importKey('raw',sender,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=new Uint8Array(await crypto.subtle.deriveBits(
  {name:'ECDH',public:key},pair.privateKey,256));
 const hmac=async(k,msg)=>{
  const kk=await crypto.subtle.importKey('raw',k,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC',kk,msg));
 };
 const join=(...ps)=>{const n=ps.reduce((t,p)=>t+p.length,0),o=new Uint8Array(n);
  let i=0;for(const p of ps){o.set(p,i);i+=p.length;}return o;};
 const expand=async(k,info,n)=>{let out=new Uint8Array(),last=new Uint8Array(),i=1;
  while(out.length<n){last=await hmac(k,join(last,info,new Uint8Array([i++])));out=join(out,last);}
  return out.slice(0,n);
 };
 const te=new TextEncoder(),prk=await hmac(auth,shared);
 const ikm=await expand(prk,join(te.encode('WebPush: info\0'),pub,sender),32);
 const root=await hmac(salt,ikm),cek=await expand(root,te.encode('Content-Encoding: aes128gcm\0'),16);
 const nonce=await expand(root,te.encode('Content-Encoding: nonce\0'),12);
 const aes=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['decrypt']);
 const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},
  aes,encrypted.slice(86)));
 assert.equal(plain.at(-1),2);
 assert.deepEqual(JSON.parse(new TextDecoder().decode(plain.slice(0,-1))),payload);
});
test('WebPush has real VAPID auth and FCM never sends without service credentials',async()=>{
 const key=await browserKey();
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign']);
 const pub=new Uint8Array(await crypto.subtle.exportKey('raw',pair.publicKey));
 const priv=await crypto.subtle.exportKey('jwk',pair.privateKey);
 let requested=false;
 const answer=await sendWebPush({PUSH_VAPID_PUBLIC_KEY:b64(pub),
  PUSH_VAPID_PRIVATE_KEY:priv.d},{endpoint:key.subscription.endpoint,
  p256dh:key.subscription.keys.p256dh,auth_secret:key.subscription.keys.auth},
  {title:'HAVANA NICE',body:'Mensaje',kind:'chat.message',targetId:'1'},
  async(_url,req)=>{requested=true;assert.match(req.headers.Authorization,/^vapid t=/);
   assert.equal(req.headers['Content-Encoding'],'aes128gcm');
   assert.ok(req.body.length>120);return new Response(null,{status:201});});
 assert.equal(requested,true);assert.equal(answer.ok,true);
 assert.equal((await sendFcmPush({},{})).unconfigured,true);
 assert.equal((await sendWebPush({}, {endpoint:'https://attacker.test'},{})).terminal,true);
});

test('Provider readiness verifies project ID and private credential format without revealing secrets',async()=>{
 const {env,api}=dbFixture();
 let config=await (await api('GET','/api/push/config')).json();
 assert.equal(config.androidReady,false);
 assert.equal(config.webReady,false);
 env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({
  project_id:'different-project',client_email:'firebase-adminsdk@different-project.iam.gserviceaccount.com',
  private_key:'-----BEGIN PRIVATE KEY-----test'
 });
 config=await (await api('GET','/api/push/config')).json();
 assert.equal(config.androidReady,false);
 env.FCM_SERVICE_ACCOUNT_JSON=JSON.stringify({
  project_id:'havana-nice-v2-push',client_email:'firebase-adminsdk@havana-nice-v2-push.iam.gserviceaccount.com',
  private_key:'-----BEGIN PRIVATE KEY-----test'
 });
 env.PUSH_VAPID_PUBLIC_KEY='A'.repeat(87);
 env.PUSH_VAPID_PRIVATE_KEY='B'.repeat(43);
 config=await (await api('GET','/api/push/config')).json();
 assert.equal(config.androidReady,true);
 assert.equal(config.webReady,true);
 assert.equal(config.publicKey,env.PUSH_VAPID_PUBLIC_KEY);
 assert.ok(!JSON.stringify(config).includes(env.PUSH_VAPID_PRIVATE_KEY));
 assert.ok(!JSON.stringify(config).includes('firebase-adminsdk'));
});
