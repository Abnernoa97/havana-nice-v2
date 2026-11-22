// HAVANA NICE V2 · isolated member profile photographs.
// Single Chat authorization, private R2, short-lived grants, no parallel login.
import {sha256Hex} from '../../shared/crypto-helpers.js';
import {notifyFamilyClients} from '../family/family-realtime.js';
import {notifyTeamProfilePhoto} from '../notices/member-notifications.js';

const MAX_AVATAR=1_500_000;
const EXPIRES=10*60*1000;
const ID=/^member:(?:[a-z0-9_-]{1,28}|[0-9a-f-]{36})$/i;
const AUTH_PREFIX='/api/profile/photo/';
function json(value,status=200,origin=''){
 return new Response(JSON.stringify(value),{status,headers:{
  'content-type':'application/json;charset=utf-8','cache-control':'no-store',
  'access-control-allow-origin':origin||'https://havana-nice-v2-dev.pages.dev','vary':'Origin'
 }});
}
async function readPhotoGrant(request,env,url,origin){
 if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Método no permitido'},405,origin);
 const id=url.pathname.slice(AUTH_PREFIX.length);
 if(!/^[a-f0-9]{32}$/.test(id))return json({error:'Foto no encontrada'},404,origin);
 const grant=await env.DB.prepare(
  'SELECT p.photo_key FROM member_profile_grants g '+
  'JOIN member_profiles p ON p.actor_id=g.actor_id AND p.photo_key=g.photo_key '+
  'JOIN chat_members m ON m.actor_id=p.actor_id AND m.active=1 '+
  'WHERE g.token_hash=? AND g.expires_at>?'
 ).bind(await sha256Hex(id),Date.now()).first();
 if(!grant)return json({error:'Foto caducada'},404,origin);
 const object=await env.MEDIA_BUCKET.get(grant.photo_key);
 if(!object)return json({error:'Foto no encontrada'},404,origin);
 return new Response(request.method==='HEAD'?null:object.body,{status:200,headers:{
  'content-type':'image/jpeg','cache-control':'private,no-store','x-content-type-options':'nosniff',
  'content-disposition':'inline','referrer-policy':'no-referrer',
  'access-control-allow-origin':origin||'https://havana-nice-v2-dev.pages.dev','vary':'Origin',
  'content-length':String(object.size)
 }});
}
async function listProfiles(env,origin,workerOrigin){
 await env.DB.prepare('DELETE FROM member_profile_grants WHERE expires_at<=?').bind(Date.now()).run();
 const rows=(await env.DB.prepare(
  'SELECT m.actor_id,m.display_name,p.photo_key FROM chat_members m '+
  'LEFT JOIN member_profiles p ON p.actor_id=m.actor_id '+
  'WHERE m.active=1 ORDER BY m.display_name COLLATE NOCASE,m.actor_id LIMIT 30'
 ).all()).results||[];
 const grants=await Promise.all(rows.map(async row=>{
  if(!row.photo_key)return null;
  const token=crypto.randomUUID().replace(/-/g,'');
  const hash=await sha256Hex(token);
  await env.DB.prepare(
   'INSERT INTO member_profile_grants(token_hash,actor_id,photo_key,expires_at) VALUES(?,?,?,?)'
  ).bind(hash,row.actor_id,row.photo_key,Date.now()+EXPIRES).run();
  return AUTH_PREFIX+token;
 }));
 return json({profiles:rows.map((row,i)=>({
  actorId:row.actor_id,name:row.display_name,
  photoUrl:grants[i]?new URL(grants[i],workerOrigin).toString():null
 }))},200,origin);
}
async function uploadPhoto(request,env,actor,origin,ctx){
 if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='image/jpeg')
  return json({error:'La fotografía debe estar en formato JPG.'},415,origin);
 const declared=Number(request.headers.get('content-length'));
 if(!Number.isSafeInteger(declared)||declared<=0||declared>MAX_AVATAR)
  return json({error:'La fotografía debe pesar menos de 1.5 MB.'},413,origin);
 const data=await request.arrayBuffer();
 if(data.byteLength!==declared||data.byteLength<4||data.byteLength>MAX_AVATAR)
  return json({error:'Tamaño de fotografía no válido.'},400,origin);
 const head=new Uint8Array(data);
 if(head[0]!==0xff||head[1]!==0xd8||head[head.length-2]!==0xff||head[head.length-1]!==0xd9)
  return json({error:'El archivo JPG está dañado o no es válido.'},415,origin);
 if(!ID.test(actor.actorId))return json({error:'Identidad no válida'},403,origin);
 const previous=await env.DB.prepare(
  'SELECT photo_key FROM member_profiles WHERE actor_id=?'
 ).bind(actor.actorId).first();
 const objectKey='profiles/'+encodeURIComponent(actor.actorId)+'/'+crypto.randomUUID()+'.jpg';
 try{
  await env.MEDIA_BUCKET.put(objectKey,data,{httpMetadata:{contentType:'image/jpeg'}});
 }catch{return json({error:'No se pudo guardar la foto en R2.'},503,origin);}
 try{
  const sql=[
   env.DB.prepare(
    'INSERT INTO member_profiles(actor_id,photo_key,photo_size,updated_at) VALUES(?,?,?,?) '+
    'ON CONFLICT(actor_id) DO UPDATE SET photo_key=excluded.photo_key,'+
    'photo_size=excluded.photo_size,updated_at=excluded.updated_at'
   ).bind(actor.actorId,objectKey,data.byteLength,Date.now())
  ];
  if(previous?.photo_key&&previous.photo_key!==objectKey){
   // Durable cleanup means replacing an avatar cannot leak abandoned R2 files.
   sql.push(env.DB.prepare(
    'INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) '+
    'VALUES(?,?,NULL,0,?)'
   ).bind(previous.photo_key,actor.actorId,Date.now()));
  }
  await env.DB.batch(sql);
 }catch{
  await env.MEDIA_BUCKET.delete(objectKey).catch(()=>{});
  return json({error:'No se pudo asociar la foto al perfil.'},503,origin);
 }
 if(previous?.photo_key&&previous.photo_key!==objectKey){
  const task=(async()=>{
   try{
    await env.MEDIA_BUCKET.delete(previous.photo_key);
    await env.DB.prepare('DELETE FROM r2_member_delete_queue WHERE object_key=?').bind(previous.photo_key).run();
   }catch{/* durable queue will retain object for retry */}
  })();
  if(ctx?.waitUntil)ctx.waitUntil(task);else void task;
 }
 // Only after the profile image has committed: notify the other authorized
 // teammates once. Neither the R2 object key nor a temporary grant is shared.
 const signal=Promise.all([
  notifyFamilyClients(env),
  notifyTeamProfilePhoto(env,actor,objectKey)
 ]).catch(()=>{});
 if(ctx?.waitUntil)ctx.waitUntil(signal);else void signal;
 return json({ok:true,actorId:actor.actorId},200,origin);
}
export async function handleProfileApi(request,env,url,origin,verifySession,ctx){
 if(!env.MEDIA_BUCKET)return json({error:'Perfiles no disponibles'},503,origin);
 try{
  if(url.pathname.startsWith(AUTH_PREFIX))return readPhotoGrant(request,env,url,origin);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const actor=await verifySession(env,token);
  if(!actor)return json({error:'No autorizado'},401,origin);
  if(url.pathname==='/api/profile/team'&&request.method==='GET')
   return listProfiles(env,origin,url.origin);
  if(url.pathname==='/api/profile/me/photo'&&request.method==='PUT')
   return uploadPhoto(request,env,actor,origin,ctx);
  return json({error:'Ruta no encontrada'},404,origin);
 }catch{return json({error:'Perfiles no disponibles'},503,origin);}
}
