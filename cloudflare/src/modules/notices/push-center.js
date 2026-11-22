// HAVANA NICE V2 · one authenticated push-device registry and outbox.
// Existing musician Chat sessions are the ONLY authorization boundary.
// No private token, Web Push endpoint, VAPID secret, or R2 key leaves the API.
import {sha256Hex} from '../../shared/crypto-helpers.js';
import {dispatchDuePush} from './push-delivery.js';

const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'private,no-store','access-control-allow-origin':origin||
   'https://havana-nice-v2.pages.dev','vary':'Origin'}
});
const b64url=/^[A-Za-z0-9_-]+={0,2}$/;
function validPushEndpoint(raw){
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port||
   url.search||url.hash||raw.length>2048)return false;
  const host=url.hostname.toLowerCase();
  return host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||
   host.endsWith('.push.apple.com')||
   host.endsWith('.notify.windows.com')||
   host==='push.services.mozilla.com';
 }catch{return false;}
}
function validWebKeys(keys){
 return typeof keys?.p256dh==='string'&&keys.p256dh.length>=85&&
  keys.p256dh.length<=100&&b64url.test(keys.p256dh)&&
  typeof keys?.auth==='string'&&keys.auth.length>=20&&
  keys.auth.length<=28&&b64url.test(keys.auth);
}
function validFcmToken(value){
 return typeof value==='string'&&value.length>=32&&value.length<=4096&&
  /^[A-Za-z0-9:_-]+$/.test(value);
}

function fcmConfigured(env){
 try{
  const value=JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON||'null');
  return value?.project_id==='havana-nice-v2-push'&&
   typeof value?.client_email==='string'&&
   value.client_email.endsWith('.iam.gserviceaccount.com')&&
   typeof value?.private_key==='string'&&
   value.private_key.includes('-----BEGIN PRIVATE KEY-----');
 }catch{return false;}
}
function webConfigured(env){
 return typeof env.PUSH_VAPID_PUBLIC_KEY==='string'&&
  env.PUSH_VAPID_PUBLIC_KEY.length===87&&
  typeof env.PUSH_VAPID_PRIVATE_KEY==='string'&&
  env.PUSH_VAPID_PRIVATE_KEY.length===43;
}
export async function handleMemberPushApi(request,env,url,origin,verifySession){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const actor=await verifySession(env,token);
 if(!actor)return json({error:'No autorizado'},401,origin);
 const route=url.pathname;
 if(route==='/api/push/config'&&request.method==='GET'){
  // Public VAPID key only; private keys stay in Worker secret bindings.
  return json({webReady:webConfigured(env),
   publicKey:webConfigured(env)?env.PUSH_VAPID_PUBLIC_KEY:null,
   androidReady:fcmConfigured(env)},200,origin);
 }
 if(route==='/api/push/devices'&&request.method==='GET'){
  try{
   const row=await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM member_push_devices WHERE actor_id=? AND session_hash=? AND revoked_at IS NULL'
   ).bind(actor.actorId,await sha256Hex(token)).first();
   return json({registered:Number(row?.count||0)},200,origin);
  }catch{return json({registered:0,configured:false},503,origin);}
 }
 if(route!=='/api/push/devices'||!['POST','DELETE'].includes(request.method))
  return json({error:'Ruta no encontrada'},404,origin);
 let data;
 try{data=await request.json();}catch{return json({error:'Solicitud inválida'},400,origin);}
 if(request.method==='DELETE'){
  const platform=data?.platform;
  const value=platform==='webpush'?data?.endpoint:platform==='android-fcm'?data?.token:null;
  if(typeof value!=='string'||value.length<32)return json({error:'Dispositivo inválido'},400,origin);
  const hash=await sha256Hex(platform+':'+value);
  await env.DB.prepare(
   'UPDATE member_push_devices SET revoked_at=?,updated_at=? WHERE actor_id=? AND session_hash=? AND token_hash=?'
  ).bind(Date.now(),Date.now(),actor.actorId,await sha256Hex(token),hash).run();
  return json({ok:true},200,origin);
 }
 const platform=data?.platform;
 const endpoint=platform==='webpush'?data?.subscription?.endpoint:data?.token;
 const keys=platform==='webpush'?data?.subscription?.keys:null;
 if(!((platform==='webpush'&&validPushEndpoint(endpoint)&&validWebKeys(keys))||
  (platform==='android-fcm'&&validFcmToken(endpoint))))
  return json({error:'Suscripción push inválida'},400,origin);
 const hash=await sha256Hex(platform+':'+endpoint);
 const sessionHash=await sha256Hex(token);
 const now=Date.now();
 try{
  const existing=await env.DB.prepare(
   'SELECT id,actor_id FROM member_push_devices WHERE token_hash=?'
  ).bind(hash).first();
  const id=existing?.id||crypto.randomUUID();
  // A token reassigned after sign-out must never inherit a prior user's
  // undelivered messages.
  if(existing&&existing.actor_id!==actor.actorId)
   await env.DB.prepare('DELETE FROM member_push_outbox WHERE device_id=?')
    .bind(id).run();
  await env.DB.prepare(
   'INSERT INTO member_push_devices(id,actor_id,session_hash,platform,token_hash,endpoint,p256dh,auth_secret,created_at,updated_at,revoked_at) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(token_hash) DO UPDATE SET '+
   'actor_id=excluded.actor_id,session_hash=excluded.session_hash,endpoint=excluded.endpoint,p256dh=excluded.p256dh,'+
   'auth_secret=excluded.auth_secret,updated_at=excluded.updated_at,revoked_at=NULL'
  ).bind(id,actor.actorId,sessionHash,platform,hash,endpoint,keys?.p256dh||null,
   keys?.auth||null,now,now).run();
  // Bounded active devices per musician, oldest beyond the limit retired.
  await env.DB.prepare(
   'UPDATE member_push_devices SET revoked_at=? WHERE id IN ('+
   'SELECT id FROM member_push_devices WHERE actor_id=? AND revoked_at IS NULL '+
   'ORDER BY updated_at DESC,id DESC LIMIT -1 OFFSET 10)'
  ).bind(now,actor.actorId).run();
  return json({ok:true,platform},201,origin);
 }catch{return json({error:'No se pudo registrar el dispositivo'},503,origin);}
}

// A committed inbox item is delivered independently to every enrolled device.
// No browser or Android client may forge recipients, actor names, or events.
export async function queueNoticePush(env,{noticeId,recipientId,kind,targetId,title,body}){
 try{
  const devices=(await env.DB.prepare(
   'SELECT d.id FROM member_push_devices d '+
   'JOIN chat_sessions s ON s.token_hash=d.session_hash AND s.actor_id=d.actor_id AND s.expires_at>? '+
   'JOIN chat_single_device_owners owner ON owner.actor_id=d.actor_id AND owner.token_hash=d.session_hash '+
   'WHERE d.actor_id=? AND d.revoked_at IS NULL LIMIT 10'
  ).bind(Date.now(),recipientId).all()).results||[];
  if(!devices.length)return 0;
  const now=Date.now();
  const statements=devices.map(device=>env.DB.prepare(
   'INSERT OR IGNORE INTO member_push_outbox '+
   '(id,notice_id,device_id,recipient_id,kind,target_id,title,body,created_at,next_attempt_at) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?)'
  ).bind(crypto.randomUUID(),noticeId,device.id,recipientId,String(kind).slice(0,60),
   String(targetId).slice(0,100),String(title).slice(0,80),
   String(body).slice(0,160),now,now));
  await env.DB.batch(statements);
  // Deliver now, not only when the app is reopened. Unavailable providers
  // remain pending for the same Worker's scheduled retry; never drop inbox data.
  if(env.FCM_SERVICE_ACCOUNT_JSON||
    (env.PUSH_VAPID_PUBLIC_KEY&&env.PUSH_VAPID_PRIVATE_KEY))
   await dispatchDuePush(env,{recipientId,limit:10}).catch(()=>{});
  return devices.length;
 }catch{
  // Migration not applied yet, or transient D1 trouble: don't undo a
  // committed Chat message, comment, album upload or inbox notice.
  return 0;
 }
}
