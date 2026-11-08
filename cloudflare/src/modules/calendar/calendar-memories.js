// HAVANA NICE V2 · event memories in the existing Calendar, D1 and private R2.
// Same high-quality WebP encoder and one StPageFlip reader as BOOK; no new motor.
import {verifyAdminSession} from '../admin/admin-auth.js';
import {sha256Hex} from '../../shared/crypto-helpers.js';
import {reserveFamilyStorage,releaseFamilyStorage} from '../family/family-quota.js';
import {notifyCalendarClients} from './calendar-realtime.js';

const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRANT=/^[a-f0-9]{32}$/;
const TYPES=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
const MAX_BYTES=15*1024*1024, MAX_WEBP_BYTES=5*1024*1024,MAX_PHOTOS=50;
const GRANT_MS=10*60*1000;
const ROUTE='/api/calendar/photo/';
const response=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
const mediaHeaders={
 'cache-control':'private, no-store','referrer-policy':'no-referrer',
 'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"
};
const sizeOf=request=>Number(request.headers.get('content-length'));
const mimeOf=request=>(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
const nowIso=()=>new Date().toISOString();

function isoToday(timeZone){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone,
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=type=>parts.find(p=>p.type===type)?.value||'';
 return value('year')+'-'+value('month')+'-'+value('day');
}
function completed(event){
 return event?.status==='confirmed'&&typeof event.date_sort==='string'&&
  /^\d{4}-\d{2}-\d{2}$/.test(event.date_sort)&&
  event.date_sort<isoToday(event.time_zone);
}
async function eventRow(env,id){
 return await env.DB.prepare(
  'SELECT id,date_sort,time_zone,status FROM calendar_events WHERE id=?'
 ).bind(id).first();
}
async function recipients(env,id){
 const result=await env.DB.prepare(
  'SELECT actor_id FROM calendar_event_recipients WHERE event_id=?'
 ).bind(id).all();
 return (result.results||[]).map(x=>x.actor_id);
}
async function cleanup(env){
 if(!env.MEDIA_BUCKET)return;
 const rows=(await env.DB.prepare(
  'SELECT object_key FROM calendar_photo_delete_queue ORDER BY queued_at LIMIT 30'
 ).all()).results||[];
 for(const row of rows){
  try{
   await env.MEDIA_BUCKET.delete(row.object_key);
   await env.DB.prepare('DELETE FROM calendar_photo_delete_queue WHERE object_key=?')
    .bind(row.object_key).run();
  }catch{ /* Durable queue remains until next authorized photo mutation. */ }
 }
}
async function queueOrphan(env,key,size){
 try{await env.MEDIA_BUCKET.delete(key);}
 catch{
  await env.DB.prepare('INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)')
   .bind(key,size,nowIso()).run();
 }
}
async function grantPhotos(env,photos,admin,actorId,variant='reader'){
 if(!photos.length)return [];
 const expires=Date.now()+GRANT_MS;
 const tokens=photos.map(()=>crypto.randomUUID().replaceAll('-',''));
 const hashes=await Promise.all(tokens.map(sha256Hex));
 await env.DB.batch(photos.map((photo,i)=>env.DB.prepare(
  'INSERT INTO calendar_photo_grants(token_hash,photo_id,actor_id,admin_only,variant,expires_at) VALUES(?,?,?,?,?,?)'
 ).bind(hashes[i],photo.id,admin?null:actorId,admin?1:0,
  variant==='reader'&&photo.optimized_key?'optimized':'original',expires)));
 return tokens.map(x=>ROUTE+x);
}
async function listPhotos(env,id,admin,actorId){
 const event=await eventRow(env,id);
 if(!event)return response({error:'Evento no encontrado'},404);
 if(!admin){
  const assigned=await env.DB.prepare(
   'SELECT 1 AS allowed FROM calendar_event_recipients WHERE event_id=? AND actor_id=?'
  ).bind(id,actorId).first();
  if(!assigned)return response({error:'No autorizado'},403);
  if(!completed(event))return response({error:'El recuerdo se abre cuando termine el evento'},403);
 }
 await env.DB.prepare('DELETE FROM calendar_photo_grants WHERE expires_at<=?')
  .bind(Date.now()).run();
 const rows=(await env.DB.prepare(
  'SELECT id,event_id,position,mime_type,size_bytes,optimized_key,optimized_size_bytes,optimized_width,optimized_height '+
  'FROM calendar_event_photos WHERE event_id=? ORDER BY position ASC,created_at ASC,id ASC LIMIT ?'
 ).bind(id,MAX_PHOTOS).all()).results||[];
 const urls=await grantPhotos(env,rows,admin,actorId);
 const originals=admin?await grantPhotos(env,rows,true,null,'original'):[];
 return response({photos:rows.map((p,i)=>({
  id:p.id,url:urls[i],position:p.position,fit:'cover',
  ...(admin?{originalUrl:originals[i],sizeBytes:p.size_bytes,
   optimizedSizeBytes:p.optimized_key?p.optimized_size_bytes:0}: {})
 }))});
}
async function servePhoto(request,env,path){
 if(request.method!=='GET'&&request.method!=='HEAD')return response({error:'Método no permitido'},405);
 const token=path.slice(ROUTE.length);
 if(!GRANT.test(token))return response({error:'Foto no encontrada'},404);
 const row=await env.DB.prepare(
  'SELECT p.object_key,p.mime_type,p.optimized_key,g.variant,g.admin_only,'+
  'e.date_sort,e.time_zone,e.status FROM calendar_photo_grants g '+
  'JOIN calendar_event_photos p ON p.id=g.photo_id '+
  'JOIN calendar_events e ON e.id=p.event_id '+
  'WHERE g.token_hash=? AND g.expires_at>? AND (g.admin_only=1 OR '+
  'EXISTS(SELECT 1 FROM calendar_event_recipients r '+
  'JOIN chat_members m ON m.actor_id=r.actor_id AND m.active=1 '+
  'WHERE r.event_id=p.event_id AND r.actor_id=g.actor_id))'
 ).bind(await sha256Hex(token),Date.now()).first();
 if(!row||(!row.admin_only&&!completed(row)))return response({error:'Foto no autorizada'},404);
 if(!env.MEDIA_BUCKET)return response({error:'Almacenamiento no disponible'},503);
 const optimized=row.variant==='optimized'&&!!row.optimized_key;
 let object=await env.MEDIA_BUCKET.get(optimized?row.optimized_key:row.object_key);
 let mime=optimized?'image/webp':row.mime_type;
 if(!object&&optimized){
  object=await env.MEDIA_BUCKET.get(row.object_key);
  mime=row.mime_type;
 }
 if(!object)return response({error:'Foto no encontrada'},404);
 return new Response(request.method==='HEAD'?null:object.body,{status:200,
  headers:{...mediaHeaders,'content-type':mime,'content-length':String(object.size)}});
}
async function uploadPhoto(request,env,eventId){
 if(!env.MEDIA_BUCKET)return response({error:'Almacenamiento no disponible'},503);
 const mime=mimeOf(request),size=sizeOf(request);
 if(!TYPES.has(mime))return response({error:'Solo JPG, PNG, WebP, HEIC o HEIF'},415);
 if(!Number.isSafeInteger(size)||size<=0||size>MAX_BYTES||!request.body)
  return response({error:'Fotografía vacía o mayor a 15 MB'},413);
 const count=await env.DB.prepare(
  'SELECT COUNT(*) AS n FROM calendar_event_photos WHERE event_id=?'
 ).bind(eventId).first();
 if(Number(count?.n||0)>=MAX_PHOTOS)return response({error:'Máximo de 50 fotos por evento'},409);
 const id=crypto.randomUUID(),key='calendar/v2/memories/'+eventId+'/'+id;
 const reserved=await reserveFamilyStorage(env,size,id);
 if(!reserved)return response({error:'Espacio R2 insuficiente (protección 9.5 GB)'},409);
 let stored=false;
 try{
  const object=await env.MEDIA_BUCKET.put(key,request.body,{
   httpMetadata:{contentType:mime},customMetadata:{module:'calendar-event-memories-v2'}
  });
  if(object?.size!==size)throw Error('Longitud incorrecta');
  stored=true;
  await env.DB.prepare(
   'INSERT INTO calendar_event_photos(id,event_id,object_key,mime_type,size_bytes,position,created_at) '+
   'VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(position),0)+100 FROM calendar_event_photos WHERE event_id=?),?)'
  ).bind(id,eventId,key,mime,size,eventId,nowIso()).run();
  return response({ok:true,id},201);
 }catch{
  if(stored)await queueOrphan(env,key,size);
  return response({error:'No se pudo guardar la fotografía privada'},503);
 }finally{await releaseFamilyStorage(env,reserved);}
}
async function optimizePhoto(request,env,eventId,id){
 const photo=await env.DB.prepare(
  'SELECT object_key,size_bytes,optimized_key,optimized_size_bytes FROM calendar_event_photos WHERE id=? AND event_id=?'
 ).bind(id,eventId).first();
 if(!photo)return response({error:'Foto no encontrada'},404);
 const size=sizeOf(request),width=Number(request.headers.get('x-book-width'));
 const height=Number(request.headers.get('x-book-height'));
 if(mimeOf(request)!=='image/webp')return response({error:'Formato WebP requerido'},415);
 if(!Number.isSafeInteger(size)||size<100||size>MAX_WEBP_BYTES||
  size>=Number(photo.size_bytes)*.94)return response({error:'Copia WebP demasiado grande'},413);
 if(!Number.isInteger(width)||!Number.isInteger(height)||
  Math.min(width,height)<1||Math.max(width,height)>2200)
  return response({error:'Dimensiones inválidas'},400);
 const bytes=new Uint8Array(await request.arrayBuffer());
 const text=x=>String.fromCharCode(...bytes.subarray(x,x+4));
 if(bytes.byteLength!==size||text(0)!=='RIFF'||text(8)!=='WEBP')
  return response({error:'Archivo WebP inválido'},415);
 const key='calendar/v2/memories/optimized/'+id+'/'+crypto.randomUUID()+'.webp';
 const reserved=await reserveFamilyStorage(env,size);
 if(!reserved)return response({error:'Espacio R2 insuficiente'},409);
 let stored=false,persisted=false;
 try{
  const object=await env.MEDIA_BUCKET.put(key,bytes,{
   httpMetadata:{contentType:'image/webp'},
   customMetadata:{module:'calendar-event-memories-v2',variant:'optimized'}
  });
  if(object?.size!==size)throw Error('Longitud optimizada incorrecta');
  stored=true;
  const old=photo.optimized_key;
  const statements=[];
  if(old)statements.push(env.DB.prepare(
   'INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) '+
   'SELECT optimized_key,optimized_size_bytes,? FROM calendar_event_photos '+
   'WHERE id=? AND event_id=? AND optimized_key=?'
  ).bind(nowIso(),id,eventId,old));
  statements.push(env.DB.prepare(
   'UPDATE calendar_event_photos SET optimized_key=?,optimized_size_bytes=?,optimized_width=?,optimized_height=? '+
   'WHERE id=? AND event_id=? AND object_key=? AND optimized_key IS ?'
  ).bind(key,size,width,height,id,eventId,photo.object_key,old));
  const updates=await env.DB.batch(statements);
  if(Number(updates.at(-1)?.meta?.changes||0)!==1)throw Error('Conflicto de foto');
  persisted=true;
  if(old)await cleanup(env);
  return response({ok:true,optimizedSizeBytes:size},200);
 }catch{
  if(stored&&!persisted)await queueOrphan(env,key,size);
  return response({error:'No se pudo optimizar; original intacto'},503);
 }finally{await releaseFamilyStorage(env,reserved);}
}
async function removePhoto(env,eventId,id){
 const photo=await env.DB.prepare(
  'SELECT object_key,size_bytes,optimized_key,optimized_size_bytes FROM calendar_event_photos WHERE id=? AND event_id=?'
 ).bind(id,eventId).first();
 if(!photo)return response({error:'Foto no encontrada'},404);
 const queue=(key,bytes)=>env.DB.prepare(
  'INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) '+
  'SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM calendar_event_photos WHERE id=? AND event_id=?)'
 ).bind(key,bytes,nowIso(),id,eventId);
 const actions=[queue(photo.object_key,photo.size_bytes)];
 if(photo.optimized_key)actions.push(queue(photo.optimized_key,photo.optimized_size_bytes));
 actions.push(env.DB.prepare('DELETE FROM calendar_event_photos WHERE id=? AND event_id=?').bind(id,eventId));
 const result=await env.DB.batch(actions);
 if(Number(result.at(-1)?.meta?.changes||0)!==1)return response({error:'Foto no encontrada'},404);
 await cleanup(env);
 return response({ok:true});
}
async function reorderPhoto(request,env,eventId,id){
 let value;try{value=await request.json();}catch{return response({error:'Orden inválido'},400);}
 if(!Number.isSafeInteger(value?.position)||value.position<0||value.position>1000000)
  return response({error:'Orden inválido'},400);
 const result=await env.DB.prepare(
  'UPDATE calendar_event_photos SET position=? WHERE id=? AND event_id=?'
 ).bind(value.position,id,eventId).run();
 return Number(result.meta?.changes||0)===1?response({ok:true}):response({error:'Foto no encontrada'},404);
}
// Called before normal Calendar CRUD routing from the SAME Worker.
async function calendarMemoriesRoute(request,env,url,verifyMusicianSession){
 const path=url.pathname;
 try{
  if(path.startsWith(ROUTE))return await servePhoto(request,env,path);
  const admin=path.startsWith('/api/calendar/admin/');
  const match=new RegExp('^/api/calendar/'+(admin?'admin/':'')+
   'events/([0-9a-f-]{36})/photos(?:/([0-9a-f-]{36})(?:/(optimized))?)?$').exec(path);
  if(!match||!ID.test(match[1])||(match[2]&&!ID.test(match[2])))
   return response({error:'Ruta no encontrada'},404);
  let actorId=null;
  if(admin){
   if(!await verifyAdminSession(request,env))return response({error:'No autorizado'},401);
  }else{
   const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
   const member=await verifyMusicianSession(env,token);
   if(!member)return response({error:'No autorizado'},401);
   actorId=member.actorId;
  }
  if(!env.MEDIA_BUCKET)return response({error:'R2 no disponible'},503);
  if(request.method==='GET'&&!match[2])return await listPhotos(env,match[1],admin,actorId);
  if(!admin)return response({error:'Método no permitido'},405);
  const exists=await eventRow(env,match[1]);
  if(!exists)return response({error:'Evento no encontrado'},404);
  const done=async result=>{
   if(result.ok){
    await notifyCalendarClients(env,await recipients(env,match[1]));
   }
   return result;
  };
  if(request.method==='POST'&&!match[2])return done(await uploadPhoto(request,env,match[1]));
  if(match[2]&&request.method==='POST'&&match[3]==='optimized')
   return done(await optimizePhoto(request,env,match[1],match[2]));
  if(match[2]&&request.method==='DELETE'&&!match[3])
   return done(await removePhoto(env,match[1],match[2]));
  if(match[2]&&request.method==='PUT'&&!match[3])
   return done(await reorderPhoto(request,env,match[1],match[2]));
  return response({error:'Método no permitido'},405);
 }catch{return response({error:'Recuerdo temporalmente no disponible'},503);}
}
// Match the existing Calendar/BOOK CORS contract for hosted PWA, WebView
// and private original fetches. This wraps R2 streams without buffering them.
export async function handleCalendarMemories(request,env,url,origin,verifyMusicianSession){
 const reply=await calendarMemoriesRoute(request,env,url,verifyMusicianSession);
 const headers=new Headers(reply.headers);
 headers.set('access-control-allow-origin',origin||'https://havana-nice-v2.pages.dev');
 headers.set('vary','Origin');
 return new Response(reply.body,{status:reply.status,headers});
}
export async function queueCalendarPhotosOnEventDelete(env,eventId,version){
 const guard=' EXISTS (SELECT 1 FROM calendar_events WHERE id=? AND version=?)';
 const records=[
  env.DB.prepare('INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) '+
    'SELECT object_key,size_bytes,? FROM calendar_event_photos WHERE event_id=? AND'+guard)
   .bind(nowIso(),eventId,eventId,version),
  env.DB.prepare('INSERT OR IGNORE INTO calendar_photo_delete_queue(object_key,size_bytes,queued_at) '+
    'SELECT optimized_key,optimized_size_bytes,? FROM calendar_event_photos '+
    'WHERE event_id=? AND optimized_key IS NOT NULL AND'+guard)
   .bind(nowIso(),eventId,eventId,version),
  env.DB.prepare('DELETE FROM calendar_events WHERE id=? AND version=?').bind(eventId,version)
 ];
 const result=await env.DB.batch(records);
 if(Number(result.at(-1)?.meta?.changes||0)===1)await cleanup(env);
 return Number(result.at(-1)?.meta?.changes||0)===1;
}
