// HAVANA NICE V2 · 24h photo stories, entirely separate from profile photographs.
// Uses existing musician authorization, private R2 and lightweight Family invalidation.
import {sha256Hex} from '../../shared/crypto-helpers.js';
import {notifyFamilyClients} from '../family/family-realtime.js';
import {notifyTeamStoryPublished} from '../notices/member-notifications.js';
import {handleStoryConversation} from './story-conversation.js';

export const STORY_DURATION_MS=24*60*60*1000;
const GRANT_MAX_MS=10*60*1000;
const MAX_BYTES=1_500_000;
const MAX_ACTIVE_PER_MEMBER=12;
const PHOTO_PREFIX='/api/stories/photo/';
const ID=/^[a-f0-9-]{36}$/i;

const respond=(body,status=200,origin='')=>new Response(JSON.stringify(body),{
 status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev','vary':'Origin'}
});
const photoResponse=(stream,bytes,origin,head=false)=>new Response(head?null:stream,{
 status:200,headers:{'content-type':'image/jpeg','content-length':String(bytes),
 'cache-control':'private,no-store','x-content-type-options':'nosniff',
 'content-disposition':'inline','referrer-policy':'no-referrer',
 'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev','vary':'Origin'}
});

async function readPhoto(request,env,url,origin){
 if(!['GET','HEAD'].includes(request.method))return respond({error:'Método no permitido'},405,origin);
 const code=url.pathname.slice(PHOTO_PREFIX.length);
 if(!/^[a-f0-9]{32}$/.test(code))return respond({error:'Estado no encontrado'},404,origin);
 const row=await env.DB.prepare(
  'SELECT s.object_key FROM member_story_grants g '+
  'JOIN member_stories s ON s.id=g.story_id '+
  'JOIN chat_members m ON m.actor_id=s.actor_id AND m.active=1 '+
  'WHERE g.token_hash=? AND g.expires_at>? AND s.expires_at>?'
 ).bind(await sha256Hex(code),Date.now(),Date.now()).first();
 if(!row)return respond({error:'Estado caducado'},404,origin);
 const image=await env.MEDIA_BUCKET.get(row.object_key);
 if(!image)return respond({error:'Estado no encontrado'},404,origin);
 return photoResponse(image.body,image.size,origin,request.method==='HEAD');
}

async function listStories(env,url,origin,ctx){
 const now=Date.now();
 const rows=(await env.DB.prepare(
  'SELECT s.id,s.actor_id,m.display_name,s.created_at,s.expires_at '+
  'FROM member_stories s JOIN chat_members m ON m.actor_id=s.actor_id '+
  'WHERE m.active=1 AND s.expires_at>? ORDER BY s.created_at ASC,s.id ASC LIMIT 200'
 ).bind(now).all()).results||[];
 const photos=await Promise.all(rows.map(async row=>{
  const random=crypto.randomUUID().replace(/-/g,'');
  await env.DB.prepare(
   'INSERT INTO member_story_grants(token_hash,story_id,expires_at) VALUES(?,?,?)'
  ).bind(await sha256Hex(random),row.id,Math.min(now+GRANT_MAX_MS,row.expires_at)).run();
  return new URL(PHOTO_PREFIX+random,url.origin).toString();
 }));
 // Server timestamps are authoritative: a state stops being readable after 24h.
 // Actual R2 reclamation is independent, bounded and retried by scheduled cleanup.
 if(ctx?.waitUntil)ctx.waitUntil(cleanupExpiredStories(env,25));
 return respond({stories:rows.map((row,i)=>({
  id:row.id,actorId:row.actor_id,name:row.display_name,
  createdAt:row.created_at,expiresAt:row.expires_at,photoUrl:photos[i]
 })),serverNow:now},200,origin);
}

async function uploadStory(request,env,actor,origin,ctx){
 if((request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='image/jpeg')
  return respond({error:'Elige una fotografía.'},415,origin);
 const length=Number(request.headers.get('content-length'));
 if(request.headers.has('content-length')&&(!Number.isSafeInteger(length)||length<=0||length>MAX_BYTES))
  return respond({error:'La imagen supera 1.5 MB.'},413,origin);
 const bytes=await request.arrayBuffer();
 if(!bytes.byteLength||bytes.byteLength>MAX_BYTES)
  return respond({error:'La imagen debe pesar menos de 1.5 MB.'},413,origin);
 const data=new Uint8Array(bytes);
 if(data.length<4||data[0]!==255||data[1]!==216||
  data[data.length-2]!==255||data[data.length-1]!==217)
  return respond({error:'El formato JPG no es válido.'},415,origin);
 const now=Date.now();
 const count=await env.DB.prepare(
  'SELECT COUNT(*) AS n FROM member_stories WHERE actor_id=? AND expires_at>?'
 ).bind(actor.actorId,now).first();
 if(Number(count?.n||0)>=MAX_ACTIVE_PER_MEMBER)
  return respond({error:'Puedes tener hasta 12 estados activos. Espera a que caduque uno.'},409,origin);
 const id=crypto.randomUUID();
 const key='stories/'+encodeURIComponent(actor.actorId)+'/'+id+'.jpg';
 try{await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});}
 catch{return respond({error:'No se pudo guardar la fotografía del estado.'},503,origin);}
 try{
  await env.DB.prepare(
   'INSERT INTO member_stories(id,actor_id,object_key,byte_size,created_at,expires_at) '+
   'VALUES(?,?,?,?,?,?)'
  ).bind(id,actor.actorId,key,bytes.byteLength,now,now+STORY_DURATION_MS).run();
 }catch{
  await env.MEDIA_BUCKET.delete(key).catch(()=>{});
  return respond({error:'No se pudo publicar el estado.'},503,origin);
 }
 if(ctx?.waitUntil)ctx.waitUntil((async()=>{
  await notifyTeamStoryPublished(env,actor,id,1);
  await notifyFamilyClients(env);
 })());
 return respond({ok:true,id,createdAt:now,expiresAt:now+STORY_DURATION_MS},201,origin);
}

// One multipart request, one D1 transaction: choose up to 5 photos in one action.
// R2 is written first; any failure is rolled back and queued for durable deletion.
async function uploadStoryBatch(request,env,actor,origin,ctx){
 const type=(request.headers.get('content-type')||'').toLowerCase();
 if(!type.startsWith('multipart/form-data;'))
  return respond({error:'Selecciona entre 1 y 5 fotografías.'},415,origin);
 const declared=Number(request.headers.get('content-length'));
 if(request.headers.has('content-length')&&
  (!Number.isSafeInteger(declared)||declared<=0||declared>8_000_000))
  return respond({error:'El lote supera el tamaño permitido.'},413,origin);
 let form;
 try{form=await request.formData();}
 catch{return respond({error:'No se pudieron leer las fotografías.'},400,origin);}
 const files=form.getAll('photos');
 if(files.length<1||files.length>5||[...form.keys()].some(k=>k!=='photos'))
  return respond({error:'Selecciona entre 1 y 5 fotografías.'},400,origin);
 const now=Date.now();
 const existing=await env.DB.prepare(
  'SELECT COUNT(*) AS n FROM member_stories WHERE actor_id=? AND expires_at>?'
 ).bind(actor.actorId,now).first();
 if(Number(existing?.n||0)+files.length>MAX_ACTIVE_PER_MEMBER)
  return respond({error:'El límite es de 12 estados activos por integrante.'},409,origin);
 const contents=[];
 for(const part of files){
  if(!(part instanceof Blob)||part.type.toLowerCase()!=='image/jpeg'||
   part.size<4||part.size>MAX_BYTES)
   return respond({error:'Cada foto debe ser JPG y pesar menos de 1.5 MB.'},415,origin);
  const bytes=await part.arrayBuffer(),head=new Uint8Array(bytes);
  if(head[0]!==255||head[1]!==216||head[head.length-2]!==255||head[head.length-1]!==217)
   return respond({error:'Una fotografía JPG está dañada.'},415,origin);
  contents.push(bytes);
 }
 const records=contents.map((bytes,i)=>{
  const id=crypto.randomUUID();
  return {id,actorId:actor.actorId,object_key:
   'stories/'+encodeURIComponent(actor.actorId)+'/'+id+'.jpg',
   byte_size:bytes.byteLength,createdAt:now+i,expiresAt:now+i+STORY_DURATION_MS,
   bytes};
 });
 const uploaded=[];
 try{
  for(const item of records){
   await env.MEDIA_BUCKET.put(item.object_key,item.bytes,{httpMetadata:{contentType:'image/jpeg'}});
   uploaded.push(item);
  }
  await env.DB.batch(records.map(item=>env.DB.prepare(
   'INSERT INTO member_stories(id,actor_id,object_key,byte_size,created_at,expires_at) '+
   'VALUES(?,?,?,?,?,?)'
  ).bind(item.id,item.actorId,item.object_key,item.byte_size,item.createdAt,item.expiresAt)));
 }catch{
  // Track every uploaded key before attempting cleanup, including R2 outages.
  for(const item of uploaded){
   try{
    await env.DB.prepare(
     'INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) '+
     'VALUES(?,?,NULL,?,?)'
    ).bind(item.object_key,item.actorId,item.byte_size,Date.now()).run();
   }catch{}
   await discardObject(env,item);
  }
  return respond({error:'No se pudo publicar el lote completo. Ninguna foto se ha añadido.'},503,origin);
 }
 if(ctx?.waitUntil)ctx.waitUntil((async()=>{
  await notifyTeamStoryPublished(env,actor,records[0].id,records.length);
  await notifyFamilyClients(env);
 })());
 return respond({ok:true,count:records.length,
  ids:records.map(x=>x.id),expiresAt:records.map(x=>x.expiresAt)},201,origin);
}

async function discardObject(env,row){
 try{
  await env.MEDIA_BUCKET.delete(row.object_key);
  await env.DB.prepare('DELETE FROM r2_member_delete_queue WHERE object_key=?').bind(row.object_key).run();
 }catch{/* Durable queue retains failed R2 objects for next cleanup cycle. */}
}
async function retireStory(env,row,now){
 // Queue audio before deleting the parent story: its comments cascade in D1.
 const voices=(await env.DB.prepare(
  "SELECT voice_key AS object_key,actor_id,voice_size AS byte_size "+
  "FROM member_story_comments WHERE story_id=? AND kind='voice'"
 ).bind(row.id).all()).results||[];
 await env.DB.batch([
  ...voices.map(voice=>env.DB.prepare(
   'INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) '+
   'VALUES(?,?,NULL,?,?)'
  ).bind(voice.object_key,voice.actor_id,voice.byte_size,now)),
  env.DB.prepare(
   'INSERT OR IGNORE INTO r2_member_delete_queue(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) '+
   'VALUES(?,?,NULL,?,?)'
  ).bind(row.object_key,row.actor_id,row.byte_size,now),
  env.DB.prepare('DELETE FROM member_stories WHERE id=?').bind(row.id)
 ]);
 for(const voice of voices)await discardObject(env,voice);
 await discardObject(env,row);
}
export async function cleanupExpiredStories(env,limit=40){
 if(!env.MEDIA_BUCKET||!env.DB)return {cleaned:0};
 const now=Date.now();
 const rows=(await env.DB.prepare(
  'SELECT id,actor_id,object_key,byte_size FROM member_stories '+
  'WHERE expires_at<=? ORDER BY expires_at ASC LIMIT ?'
 ).bind(now,Math.min(Math.max(1,limit),100)).all()).results||[];
 for(const row of rows){
  try{await retireStory(env,row,now);}catch{/* R2 and DB remain authoritative; retry next invocation. */}
 }
 // Retry any previously queued story object when R2 was temporarily unavailable.
 const pending=(await env.DB.prepare(
  "SELECT object_key FROM r2_member_delete_queue WHERE object_key LIKE 'stories/%' "+
  'ORDER BY queued_at ASC LIMIT 60'
 ).all()).results||[];
 for(const row of pending)await discardObject(env,row);
 await env.DB.prepare('DELETE FROM member_story_grants WHERE expires_at<=?').bind(now).run();
 await env.DB.prepare('DELETE FROM member_story_voice_grants WHERE expires_at<=?').bind(now).run();
 return {cleaned:rows.length};
}

async function removeOwnStory(request,env,actor,url,origin,ctx){
 const id=url.pathname.slice('/api/stories/me/'.length);
 if(!ID.test(id))return respond({error:'Estado no encontrado'},404,origin);
 const row=await env.DB.prepare(
  'SELECT id,actor_id,object_key,byte_size FROM member_stories WHERE id=? AND actor_id=?'
 ).bind(id,actor.actorId).first();
 if(!row)return respond({error:'Estado no encontrado'},404,origin);
 try{await retireStory(env,row,Date.now());}
 catch{return respond({error:'No se pudo eliminar el estado.'},503,origin);}
 if(ctx?.waitUntil)ctx.waitUntil(notifyFamilyClients(env));
 return respond({ok:true},200,origin);
}
export async function handleStoriesApi(request,env,url,origin,verifySession,ctx){
 if(!env.MEDIA_BUCKET)return respond({error:'Estados no disponibles'},503,origin);
 try{
  if(url.pathname.startsWith(PHOTO_PREFIX))
   return readPhoto(request,env,url,origin);
  // One authorization for public-to-team responses, voice and reactions, not Chat.
  if(url.pathname.startsWith('/api/stories/voice/')||
   /^\/api\/stories\/[a-f0-9-]{36}\/(conversation|text|voice|reaction)$/i.test(url.pathname))
   return handleStoryConversation(request,env,url,origin,verifySession,ctx);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const actor=await verifySession(env,token);
  if(!actor)return respond({error:'No autorizado'},401,origin);
  if(url.pathname==='/api/stories/team'&&request.method==='GET')
   return listStories(env,url,origin,ctx);
  if(url.pathname==='/api/stories/me/photo'&&request.method==='PUT')
   return uploadStory(request,env,actor,origin,ctx);
  if(url.pathname==='/api/stories/me/batch'&&request.method==='POST')
   return uploadStoryBatch(request,env,actor,origin,ctx);
  if(url.pathname.startsWith('/api/stories/me/')&&request.method==='DELETE')
   return removeOwnStory(request,env,actor,url,origin,ctx);
  return respond({error:'Ruta no encontrada'},404,origin);
 }catch{return respond({error:'Estados no disponibles'},503,origin);}
}
