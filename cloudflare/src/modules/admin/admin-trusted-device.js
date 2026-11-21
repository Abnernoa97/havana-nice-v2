// Passwordless access after explicit enrollment from an existing Admin session.
// The device owns a non-extractable ECDSA private CryptoKey in its IndexedDB.
// Cloudflare D1 stores only the public key and short-lived one-use challenges.
// No musician name, credentials, user IP, admin secret or bearer is persisted.
import {adminLoginConfigured,issueAdminSession,verifyAdminSession} from './admin-auth.js';
import {sha256Hex} from '../../shared/crypto-helpers.js';

const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const B64URL=/^[A-Za-z0-9_-]{40,100}$/;
const TRUSTED_ORIGIN='https://havana-nice-v2.pages.dev';
const WINDOW_MS=3*60*1000;
const MAX_DEVICES=3;
const text=new TextEncoder();
const opaque=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const decode=value=>{
 const src=value.replace(/-/g,'+').replace(/_/g,'/');
 return Uint8Array.from(atob(src+'='.repeat((4-src.length%4)%4)),c=>c.charCodeAt(0));
};
const payload=(id,nonce)=>text.encode('havana-nice-v2-admin-device-v1\n'+id+'\n'+nonce+'\n'+TRUSTED_ORIGIN);
const validKey=(jwk)=>jwk&&typeof jwk==='object'&&!Array.isArray(jwk)&&
 jwk.kty==='EC'&&jwk.crv==='P-256'&&
 /^[A-Za-z0-9_-]{43}$/.test(jwk.x||'')&&/^[A-Za-z0-9_-]{43}$/.test(jwk.y||'')&&
 !('d' in jwk);
const onlyPublic=key=>({kty:'EC',crv:'P-256',x:key.x,y:key.y,ext:true,key_ops:['verify']});

export async function handleAdminTrustedDevice(request,env,url,origin,respond){
 const reply=(body,status=200)=>respond(body,status,origin);
 if(!adminLoginConfigured(env))return reply({error:'Administrador no configurado'},503);
 if(request.method!=='POST')return reply({error:'Método no permitido'},405);
 // A registered public key cannot be used from a different origin. This also
 // limits accidental enrollment from a preview URL rather than stable PWA.
 if(request.headers.get('Origin')!==TRUSTED_ORIGIN)
  return reply({error:'Abre el Administrador desde su enlace oficial.'},403);
 if((request.headers.get('content-type')||'').split(';')[0].trim()!=='application/json')
  return reply({error:'Se requiere JSON'},415);
 const size=Number(request.headers.get('content-length')||0);
 if(size>6000)return reply({error:'Solicitud demasiado grande'},413);
 let body;
 try{body=await request.json();}catch{return reply({error:'Solicitud inválida'},400);}
 const path=url.pathname,now=Date.now();
 const enrolled=path==='/api/chat/admin/auth/device/enroll';
 const revoke=path==='/api/chat/admin/auth/device/revoke';
 if(enrolled||revoke){
  if(!await verifyAdminSession(request,env))return reply({error:'No autorizado'},401);
  if(!ID.test(body?.deviceId||''))return reply({error:'Dispositivo inválido'},400);
  if(revoke){
   await env.DB.prepare('DELETE FROM chat_admin_trusted_devices WHERE id=?')
    .bind(body.deviceId).run();
   return reply({ok:true});
  }
  if(!validKey(body?.publicKey))return reply({error:'Clave pública inválida'},400);
  const publicKey=onlyPublic(body.publicKey);
  try{await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);}
  catch{return reply({error:'Clave pública no válida'},400);}
  // Do not auto-enroll an arbitrary visitor; verified admin session required.
  const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM chat_admin_trusted_devices WHERE revoked_at IS NULL').first();
  if(Number(count?.total||0)>=MAX_DEVICES)return reply({error:'Límite de dispositivos alcanzado'},409);
  try{
   await env.DB.prepare('INSERT INTO chat_admin_trusted_devices(id,public_jwk,created_at) VALUES(?,?,?)')
    .bind(body.deviceId,JSON.stringify(publicKey),now).run();
   return reply({ok:true});
  }catch{return reply({error:'No se pudo autorizar el dispositivo'},409);}
 }
 if(!ID.test(body?.deviceId||''))return reply({error:'Dispositivo no autorizado'},401);
 if(path==='/api/chat/admin/auth/device/challenge'){
  const member=await env.DB.prepare(
   'SELECT id FROM chat_admin_trusted_devices WHERE id=? AND revoked_at IS NULL'
  ).bind(body.deviceId).first();
  if(!member)return reply({error:'Dispositivo no autorizado'},401);
  // Keep the challenge table bounded in normal operation.
  await env.DB.prepare('DELETE FROM chat_admin_device_challenges WHERE expires_at<?').bind(now).run();
  const challengeId=crypto.randomUUID(),challenge=opaque();
  await env.DB.prepare('INSERT INTO chat_admin_device_challenges(id,device_id,challenge_hash,expires_at) VALUES(?,?,?,?)')
   .bind(challengeId,body.deviceId,await sha256Hex(challenge),now+WINDOW_MS).run();
  return reply({challengeId,challenge});
 }
 if(path==='/api/chat/admin/auth/device/session'){
  if(!ID.test(body?.challengeId||'')||!B64URL.test(body?.challenge||'')||
   typeof body?.signature!=='string'||body.signature.length>300)
   return reply({error:'Prueba inválida'},401);
  const row=await env.DB.prepare(
   'SELECT d.public_jwk,c.challenge_hash FROM chat_admin_device_challenges c '+
   'JOIN chat_admin_trusted_devices d ON d.id=c.device_id '+
   'WHERE c.id=? AND c.device_id=? AND c.used_at IS NULL AND c.expires_at>? AND d.revoked_at IS NULL'
  ).bind(body.challengeId,body.deviceId,now).first();
  if(!row)return reply({error:'Acceso no autorizado'},401);
  // Invalidate before signature validation: the same challenge is never reusable.
  const consumed=await env.DB.prepare(
   'UPDATE chat_admin_device_challenges SET used_at=? '+
   'WHERE id=? AND device_id=? AND used_at IS NULL AND expires_at>?'
  ).bind(now,body.challengeId,body.deviceId,now).run();
  if(Number(consumed.meta?.changes||0)!==1)return reply({error:'Prueba ya utilizada'},401);
  if(await sha256Hex(body.challenge)!==row.challenge_hash)return reply({error:'Prueba inválida'},401);
  let verified=false;
  try{
   const key=await crypto.subtle.importKey('jwk',JSON.parse(row.public_jwk),
    {name:'ECDSA',namedCurve:'P-256'},false,['verify']);
   verified=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},
    key,decode(body.signature),payload(body.challengeId,body.challenge));
  }catch{return reply({error:'Dispositivo no reconocido'},401);}
  if(!verified)return reply({error:'Prueba inválida'},401);
  const session=await issueAdminSession(env);
  await env.DB.prepare('UPDATE chat_admin_trusted_devices SET last_used_at=? WHERE id=?')
   .bind(Date.now(),body.deviceId).run();
  return reply(session);
 }
 return reply({error:'Ruta no encontrada'},404);
}
