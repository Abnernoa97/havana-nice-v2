// HAVANA NICE V2 · push transport only. No Chat, UI, or device registration.
// Standards Web Push RFC 8291/8292 for installed iPhone PWA and FCM HTTP v1
// for the signed Android app. All private credentials are Cloudflare secrets.
const encoder=new TextEncoder();
const text=value=>encoder.encode(value);
const join=(...parts)=>{
 const length=parts.reduce((n,x)=>n+x.length,0),out=new Uint8Array(length);
 let at=0;for(const part of parts){out.set(part,at);at+=part.length;}return out;
};
const b64=bytes=>{
 let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
 return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const unb64=str=>{
 const raw=atob(str.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(str.length/4)*4,'='));
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
};
async function hmac(key,bytes){
 const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return new Uint8Array(await crypto.subtle.sign('HMAC',k,bytes));
}
async function expand(prk,info,size){
 let output=new Uint8Array(0),last=new Uint8Array(0),counter=1;
 while(output.length<size){
  last=await hmac(prk,join(last,info,new Uint8Array([counter++])));
  output=join(output,last);
 }
 return output.slice(0,size);
}
// HKDF of the ECDH shared secret with browser-provided authentication secret.
export async function encryptWebPush(subscription,payload){
 const receiver=unb64(subscription.p256dh),auth=unb64(subscription.auth);
 if(receiver.length!==65||receiver[0]!==4||auth.length!==16)
  throw new Error('Invalid Web Push receiver keys');
 const receiverKey=await crypto.subtle.importKey('raw',receiver,
  {name:'ECDH',namedCurve:'P-256'},false,[]);
 const senderKeys=await crypto.subtle.generateKey(
  {name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const sender=new Uint8Array(await crypto.subtle.exportKey('raw',senderKeys.publicKey));
 const secret=new Uint8Array(await crypto.subtle.deriveBits(
  {name:'ECDH',public:receiverKey},senderKeys.privateKey,256));
 const prk=await hmac(auth,secret);
 const ikm=await expand(prk,join(text('WebPush: info\0'),receiver,sender),32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const root=await hmac(salt,ikm);
 const key=await expand(root,text('Content-Encoding: aes128gcm\0'),16);
 const nonce=await expand(root,text('Content-Encoding: nonce\0'),12);
 const plaintext=join(text(JSON.stringify(payload)),new Uint8Array([2]));
 if(plaintext.length>4000)throw new Error('Push payload too large');
 const aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['encrypt']);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt(
  {name:'AES-GCM',iv:nonce,tagLength:128},aes,plaintext));
 // salt (16) + record-size (4096, u32 BE) + idlen (65) + public ECDH key + ciphertext
 return join(salt,new Uint8Array([0,0,16,0,65]),sender,encrypted);
}
async function vapidToken(endpoint,publicKey,privateKey){
 const publicBytes=unb64(publicKey),secret=unb64(privateKey);
 if(publicBytes.length!==65||publicBytes[0]!==4||secret.length!==32)
  throw new Error('Invalid VAPID credentials');
 const jwk={kty:'EC',crv:'P-256',
  x:b64(publicBytes.slice(1,33)),y:b64(publicBytes.slice(33,65)),
  d:b64(secret)};
 const key=await crypto.subtle.importKey('jwk',jwk,
  {name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const head=b64(text(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const body=b64(text(JSON.stringify({
  aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+12*60*60,
  sub:'https://havananice.com'
 })));
 const signed=head+'.'+body;
 const sig=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},
  key,text(signed)));
 if(sig.length!==64)throw new Error('Invalid Web Push ECDSA signature');
 return signed+'.'+b64(sig);
}
function allowedWebEndpoint(raw){
 try{
  const u=new URL(raw);
  return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&
   (u.hostname==='fcm.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||
    u.hostname==='push.services.mozilla.com'||u.hostname.endsWith('.push.apple.com')||
    u.hostname.endsWith('.notify.windows.com'));
 }catch{return false;}
}
export async function sendWebPush(env,device,message,fetchFn=fetch){
 if(!allowedWebEndpoint(device.endpoint))return {ok:false,terminal:true,status:400};
 if(!env.PUSH_VAPID_PUBLIC_KEY||!env.PUSH_VAPID_PRIVATE_KEY)
  return {ok:false,unconfigured:true};
 const jwt=await vapidToken(device.endpoint,env.PUSH_VAPID_PUBLIC_KEY,env.PUSH_VAPID_PRIVATE_KEY);
 const data=await encryptWebPush({p256dh:device.p256dh,auth:device.auth_secret},message);
 const reply=await fetchFn(device.endpoint,{method:'POST',headers:{
  Authorization:'vapid t='+jwt+', k='+env.PUSH_VAPID_PUBLIC_KEY,
  TTL:'3600','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream'
 },body:data,signal:AbortSignal.timeout(8500)});
 return {ok:reply.ok,terminal:reply.status===404||reply.status===410,status:reply.status};
}
let cachedAccess=null;
async function fcmAccess(env,fetchFn){
 if(cachedAccess?.expires>Date.now()+60000)return cachedAccess.token;
 const account=JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
 if(!account.project_id||!account.client_email||!account.private_key)
  throw new Error('Invalid FCM service account');
 const now=Math.floor(Date.now()/1000);
 const body={iss:account.client_email,
  scope:'https://www.googleapis.com/auth/firebase.messaging',
  aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600};
 const jwt=b64(text(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+
  b64(text(JSON.stringify(body)));
 const der=unb64(account.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')
  .replace(/\+/g,'-').replace(/\//g,'_'));
 const key=await crypto.subtle.importKey('pkcs8',der,
  {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,text(jwt))));
 const response=await fetchFn('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
   assertion:jwt+'.'+signature}),signal:AbortSignal.timeout(8500)
 });
 if(!response.ok)throw new Error('FCM OAuth rejected');
 const token=await response.json();
 if(!token.access_token)throw new Error('FCM OAuth token absent');
 cachedAccess={token:token.access_token,expires:Date.now()+Math.min(
  Number(token.expires_in||3600),3600)*1000};
 return cachedAccess.token;
}
export async function sendFcmPush(env,device,message,fetchFn=fetch){
 if(!env.FCM_SERVICE_ACCOUNT_JSON)return {ok:false,unconfigured:true};
 const account=JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
 const bearer=await fcmAccess(env,fetchFn);
 const response=await fetchFn(
  'https://fcm.googleapis.com/v1/projects/'+encodeURIComponent(account.project_id)+
  '/messages:send',{method:'POST',headers:{
   Authorization:'Bearer '+bearer,'Content-Type':'application/json'},
   body:JSON.stringify({message:{token:device.endpoint,
    notification:{title:message.title,body:message.body},
    data:{kind:message.kind,targetId:message.targetId},
    android:{priority:'high',notification:{channel_id:'havana-team-activity'}}
   }}),signal:AbortSignal.timeout(8500)});
 if(response.ok)return {ok:true,status:response.status};
 // A revoked FCM token is terminal; bad service credentials are not.
 const error=await response.json().catch(()=>null);
 const detail=error?.error?.details||[];
 const unregistered=detail.some(x=>x?.errorCode==='UNREGISTERED')||
  error?.error?.status==='NOT_FOUND';
 return {ok:false,terminal:unregistered,status:response.status};
}
// Durable per-device retry. Claim rows before external HTTP to avoid duplicate
// sends when the scheduled Worker and a user event overlap.
export async function dispatchDuePush(env,{recipientId=null,limit=15}={}){
 let rows;
 try{
  const now=Date.now();
  const args=[now,now-6*60*60*1000];
  const filter=recipientId?' AND q.recipient_id=?':'';
  if(recipientId)args.push(recipientId);
  args.push(Math.min(30,Math.max(1,limit)));
  // D1 binds in SQL order: active session expiry, due time, age, recipient, limit.
  args.unshift(now);
  rows=(await env.DB.prepare(
   'SELECT q.id,q.notice_id,q.kind,q.target_id,q.title,q.body,q.created_at,q.tries,'+
   'd.id AS device_id,d.platform,d.endpoint,d.p256dh,d.auth_secret '+
   'FROM member_push_outbox q JOIN member_push_devices d ON d.id=q.device_id '+
   'JOIN chat_members m ON m.actor_id=q.recipient_id AND m.active=1 '+
   'JOIN chat_sessions s ON s.token_hash=d.session_hash AND s.actor_id=d.actor_id AND s.expires_at>? '+
   'JOIN chat_single_device_owners owner ON owner.actor_id=d.actor_id AND owner.token_hash=d.session_hash '+
   'WHERE q.delivered_at IS NULL AND q.abandoned_at IS NULL '+
   'AND d.revoked_at IS NULL AND d.actor_id=q.recipient_id '+
   'AND q.next_attempt_at<=? AND q.created_at>?'+filter+
   ' ORDER BY q.created_at ASC,q.id ASC LIMIT ?'
  ).bind(...args).all()).results||[];
 }catch{return {sent:0,failed:0,unconfigured:0};}
 let sent=0,failed=0,unconfigured=0;
 for(const row of rows){
  const ready=row.platform==='webpush'?
   !!(env.PUSH_VAPID_PUBLIC_KEY&&env.PUSH_VAPID_PRIVATE_KEY):
   !!env.FCM_SERVICE_ACCOUNT_JSON;
  if(!ready){unconfigured++;continue;}
  const now=Date.now();
  const lock=await env.DB.prepare(
   'UPDATE member_push_outbox SET tries=tries+1,next_attempt_at=? '+
   'WHERE id=? AND delivered_at IS NULL AND abandoned_at IS NULL AND next_attempt_at<=?'
  ).bind(now+30_000,row.id,now).run();
  if(Number(lock.meta?.changes||0)!==1)continue;
  let answer;
  try{
   const msg={id:row.notice_id,title:row.title,body:row.body,kind:row.kind,targetId:row.target_id};
   answer=row.platform==='webpush'?
    await sendWebPush(env,row,msg):await sendFcmPush(env,row,msg);
  }catch{answer={ok:false,status:0};}
  if(answer?.unconfigured){unconfigured++;continue;}
  if(answer?.ok){
   await env.DB.prepare('UPDATE member_push_outbox SET delivered_at=?,last_error=NULL WHERE id=?')
    .bind(Date.now(),row.id).run();
   await env.DB.prepare('UPDATE member_push_devices SET last_success_at=?,last_error=NULL WHERE id=?')
    .bind(Date.now(),row.device_id).run();
   sent++;
  }else{
   const terminal=!!answer?.terminal||row.tries>=6;
   const backoff=Math.min(6*60*60*1000,30_000*Math.pow(2,Math.min(row.tries,7)));
   await env.DB.prepare('UPDATE member_push_outbox SET next_attempt_at=?,abandoned_at=?,last_error=? WHERE id=?')
    .bind(Date.now()+backoff,terminal?Date.now():null,'HTTP '+Number(answer?.status||0),row.id).run();
   if(answer?.terminal)
    await env.DB.prepare('UPDATE member_push_devices SET revoked_at=?,last_error=? WHERE id=?')
     .bind(Date.now(),'Token expired',row.device_id).run();
   failed++;
  }
 }
 return {sent,failed,unconfigured};
}

/** Bounded housekeeping: obsolete deliveries cannot grow D1 forever.
 * Preserves seven days of diagnostics, never touches the member inbox. */
export async function prunePushHistory(env,limit=150){
 try{
  const cutoff=Date.now()-7*24*60*60*1000;
  await env.DB.prepare(
   'DELETE FROM member_push_outbox WHERE id IN ('+
   'SELECT id FROM member_push_outbox WHERE created_at<? ORDER BY created_at LIMIT ?)'
  ).bind(cutoff,Math.min(500,limit)).run();
  // Stale revoked devices are safe to delete only after their 30-day
  // retention; existing member devices with live sessions stay untouched.
  await env.DB.prepare(
   'DELETE FROM member_push_devices WHERE id IN ('+
   'SELECT id FROM member_push_devices WHERE revoked_at IS NOT NULL AND revoked_at<? '+
   'ORDER BY revoked_at LIMIT ?)'
  ).bind(Date.now()-30*24*60*60*1000,Math.min(100,limit)).run();
  return true;
 }catch{return false;}
}
