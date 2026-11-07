// HAVANA NICE V2 · ONE private R2 bucket, same original-quality fast path as Familia.
// Media belongs to Chat messages, never to Family albums or a separate conversation.
import {reserveFamilyStorage,releaseFamilyStorage,familyStorageUsage} from '../family/family-quota.js';
import {sha256Hex} from '../../shared/crypto-helpers.js';

const MIME=new Map([['image/jpeg','photo'],['image/png','photo'],['image/webp','photo'],
 ['image/heic','photo'],['image/heif','photo'],['video/mp4','video'],['video/quicktime','video']]);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CHAT_PART_BYTES=5*1024*1024;
export const CHAT_DIRECT_MAX=15*1024*1024;
const MAX_PARTS=2000,GRANT_MS=10*60*1000,ROOM='main-chat-v2';
function reply(data,status=200,origin=''){
 return new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'access-control-allow-origin':origin||'https://havana-nice-v2-dev.pages.dev','vary':'Origin'}});
}
async function asset(env,id){
 return env.DB.prepare('SELECT id,sender_id,object_key,kind,mime_type,size_bytes,original_name,status,'+
  'multipart_upload_id,message_seq,created_at FROM chat_media_objects WHERE id=?').bind(id).first();
}
function publicMedia(row){
 return {assetId:row.id,kind:row.kind,mimeType:row.mime_type,sizeBytes:row.size_bytes,
  name:row.original_name||''};
}
async function prune(env){
 // Expired sessions do not imply deletion of complete Chat messages.
 const old=await env.DB.prepare('SELECT id,object_key,multipart_upload_id,sender_id,status FROM chat_media_objects '+
  'WHERE message_seq IS NULL AND updated_at<? LIMIT 12').bind(Date.now()-24*60*60*1000).all();
 for(const row of old.results||[]){
  try{
   if(row.status==='pending'&&row.multipart_upload_id)
    await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key,row.multipart_upload_id).abort();
   else await env.MEDIA_BUCKET.delete(row.object_key);
   await env.DB.prepare('DELETE FROM chat_media_objects WHERE id=? AND message_seq IS NULL')
    .bind(row.id).run();
   await releaseFamilyStorage(env,row.id);
  }catch{ /* Abort lifecycle also cleans multipart fragments after 24 hours. */ }
 }
 await env.DB.prepare('DELETE FROM chat_media_grants WHERE expires_at<=?').bind(Date.now()).run();
}
function expectedPart(row,index){
 const parts=Math.ceil(row.size_bytes/CHAT_PART_BYTES);
 if(index<1||index>parts)return -1;
 return index===parts?row.size_bytes-(parts-1)*CHAT_PART_BYTES:CHAT_PART_BYTES;
}
export async function startChatMedia(request,env,session,origin){
 if(!env.MEDIA_BUCKET)return reply({error:'Archivos no disponibles'},503,origin);
 let data;try{data=await request.json();}catch{return reply({error:'Solicitud inválida'},400,origin);}
 const id=data?.id,kind=MIME.get(data?.mimeType),size=data?.sizeBytes;
 if(typeof id!=='string'||!UUID.test(id)||!kind||data?.kind!==kind||
  !Number.isSafeInteger(size)||size<=0||size>9_500_000_000||
  (kind==='photo'&&size>100*1024*1024)||
  Math.ceil(size/CHAT_PART_BYTES)>MAX_PARTS)
  return reply({error:'Tipo o tamaño de archivo no admitido'},400,origin);
 const name=typeof data?.name==='string'?data.name.slice(0,120):'';
 const existing=await asset(env,id);
 if(existing){
  if(existing.sender_id!==session.actorId||existing.size_bytes!==size||existing.mime_type!==data.mimeType)
   return reply({error:'Identificador de archivo ya utilizado'},409,origin);
  // A resumed large upload must reacquire its global quota hold after expiry.
  if(existing.status==='pending'){
   const held=await env.DB.prepare('SELECT id FROM family_upload_reservations WHERE id=? AND expires_at>?')
    .bind(id,Date.now()).first();
   if(!held&&!await reserveFamilyStorage(env,size,id))
    return reply({error:'Almacenamiento casi lleno: libera espacio antes de reanudar'},409,origin);
  }
  return chatMediaStatus(env,session,id,origin);
 }
 await prune(env);
 const reserved=await reserveFamilyStorage(env,size,id);
 if(!reserved)return reply({error:'Almacenamiento casi lleno: límite compartido de 9.5 GB'},409,origin);
 const multipart=size>CHAT_DIRECT_MAX;
 const key='chat/'+encodeURIComponent(session.actorId)+'/'+id;
 let upload=null;
 try{
  if(multipart)upload=await env.MEDIA_BUCKET.createMultipartUpload(key,{httpMetadata:{contentType:data.mimeType}});
  const inserted=await env.DB.prepare('INSERT OR IGNORE INTO chat_media_objects '+
   '(id,sender_id,object_key,kind,mime_type,size_bytes,original_name,status,multipart_upload_id,created_at,updated_at) '+
   'VALUES (?,?,?,?,?,?,?,?,?,?,?)')
   .bind(id,session.actorId,key,kind,data.mimeType,size,name,'pending',upload?.uploadId||null,Date.now(),Date.now()).run();
  if(Number(inserted.meta?.changes)!==1){
   if(upload)await upload.abort().catch(()=>{});
   await releaseFamilyStorage(env,reserved);
   return chatMediaStatus(env,session,id,origin);
  }
  return reply({id,kind,multipart,partSize:CHAT_PART_BYTES,
   partCount:multipart?Math.ceil(size/CHAT_PART_BYTES):1,completedParts:[],ready:false},201,origin);
 }catch{
  if(upload)await upload.abort().catch(()=>{});
  await releaseFamilyStorage(env,reserved);
  return reply({error:'No se pudo preparar el almacenamiento privado'},503,origin);
 }
}
export async function chatMediaStatus(env,session,id,origin){
 const row=await asset(env,id);
 if(!row||row.sender_id!==session.actorId)return reply({error:'Archivo no encontrado'},404,origin);
 const parts=row.multipart_upload_id
  ?(await env.DB.prepare('SELECT part_number FROM chat_media_parts WHERE media_id=? ORDER BY part_number')
    .bind(id).all()).results||[]:[];
 return reply({id,kind:row.kind,ready:row.status==='ready',sent:row.message_seq!==null,
  multipart:!!row.multipart_upload_id,partSize:CHAT_PART_BYTES,
  partCount:Math.ceil(row.size_bytes/CHAT_PART_BYTES),
  completedParts:parts.map(x=>x.part_number)},200,origin);
}
export async function uploadChatDirect(request,env,session,id,origin){
 const row=await asset(env,id);
 if(!row||row.sender_id!==session.actorId)return reply({error:'Archivo no encontrado'},404,origin);
 if(row.status==='ready')return reply({id,ready:true},200,origin);
 if(row.status!=='pending'||row.multipart_upload_id||row.size_bytes>CHAT_DIRECT_MAX)
  return reply({error:'Se necesita transferencia multipart'},409,origin);
 if(request.headers.get('content-type')?.split(';')[0]!==row.mime_type||
  Number(request.headers.get('content-length'))!==row.size_bytes||!request.body)
  return reply({error:'Tipo o longitud de archivo incorrectos'},400,origin);
 try{
  const object=await env.MEDIA_BUCKET.put(row.object_key,request.body,{httpMetadata:{contentType:row.mime_type}});
  if(object.size!==row.size_bytes){
   await env.MEDIA_BUCKET.delete(row.object_key).catch(()=>{});
   return reply({error:'Tamaño original incompleto'},400,origin);
  }
  await env.DB.prepare("UPDATE chat_media_objects SET status='ready',updated_at=? WHERE id=? AND status='pending'")
   .bind(Date.now(),id).run();
  await releaseFamilyStorage(env,id);
  return reply({id,ready:true},201,origin);
 }catch{return reply({error:'Se interrumpió la transferencia. Reintenta el mismo archivo.'},503,origin);}
}
export async function uploadChatPart(request,env,session,id,number,origin){
 const row=await asset(env,id);
 if(!row||row.sender_id!==session.actorId)return reply({error:'Archivo no encontrado'},404,origin);
 if(row.status!=='pending'||!row.multipart_upload_id)return reply({error:'Transferencia ya finalizada'},409,origin);
 const bytes=expectedPart(row,number);
 if(bytes<1||Number(request.headers.get('content-length'))!==bytes||!request.body)
  return reply({error:'Fragmento incorrecto'},400,origin);
 try{
  const uploaded=await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key,row.multipart_upload_id)
   .uploadPart(number,request.body);
  await env.DB.prepare('INSERT INTO chat_media_parts(media_id,part_number,etag,size_bytes) VALUES(?,?,?,?) '+
   'ON CONFLICT(media_id,part_number) DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes')
   .bind(id,number,uploaded.etag,bytes).run();
  return reply({ok:true,partNumber:number},200,origin);
 }catch{return reply({error:'Fragmento no disponible; reintenta solamente esa parte'},503,origin);}
}
export async function completeChatMedia(env,session,id,origin){
 const row=await asset(env,id);
 if(!row||row.sender_id!==session.actorId)return reply({error:'Archivo no encontrado'},404,origin);
 if(row.status==='ready')return reply({id,ready:true},200,origin);
 if(row.status!=='pending'||!row.multipart_upload_id)return reply({error:'Transferencia inválida'},409,origin);
 const parts=(await env.DB.prepare('SELECT part_number,etag,size_bytes FROM chat_media_parts '+
  'WHERE media_id=? ORDER BY part_number').bind(id).all()).results||[];
 const total=Math.ceil(row.size_bytes/CHAT_PART_BYTES);
 if(parts.length!==total||parts.some((x,i)=>x.part_number!==i+1||x.size_bytes!==expectedPart(row,i+1)))
  return reply({error:'Faltan partes del video'},409,origin);
 try{
  const result=await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key,row.multipart_upload_id)
   .complete(parts.map(x=>({partNumber:x.part_number,etag:x.etag})));
  if(result.size!==row.size_bytes){
   await env.MEDIA_BUCKET.delete(row.object_key).catch(()=>{});
   return reply({error:'Tamaño original incorrecto'},400,origin);
  }
  await env.DB.batch([
   env.DB.prepare("UPDATE chat_media_objects SET status='ready',updated_at=? WHERE id=? AND status='pending'")
    .bind(Date.now(),id),
   env.DB.prepare('DELETE FROM chat_media_parts WHERE media_id=?').bind(id)
  ]);
  await releaseFamilyStorage(env,id);
  return reply({id,ready:true},201,origin);
 }catch{
  const stored=await env.MEDIA_BUCKET.head(row.object_key).catch(()=>null);
  if(stored?.size===row.size_bytes){
   await env.DB.prepare("UPDATE chat_media_objects SET status='ready',updated_at=? WHERE id=?")
    .bind(Date.now(),id).run();
   await env.DB.prepare('DELETE FROM chat_media_parts WHERE media_id=?').bind(id).run();
   await releaseFamilyStorage(env,id);
   return reply({id,ready:true},200,origin);
  }
  return reply({error:'No se pudo completar; reintenta la confirmación'},503,origin);
 }
}
export async function sendChatMedia(env,session,id,origin){
 const row=await asset(env,id);
 if(!row||row.sender_id!==session.actorId||row.status!=='ready')
  return reply({error:'Primero debe finalizar la carga original'},409,origin);
 // A media file owns one canonical message; retries never create duplicates.
 const text=row.kind==='photo'?'Foto':'Video';
 try{
  const existing=await env.DB.prepare('SELECT seq FROM chat_messages WHERE sender_id=? AND client_message_id=?')
   .bind(session.actorId,id).first();
  if(!existing){
   await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO chat_messages (client_message_id,sender_id,sender_name,body,created_at) '+
     'VALUES (?,?,?,?,?)').bind(id,session.actorId,session.displayName,text,new Date().toISOString()),
    env.DB.prepare('UPDATE chat_media_objects SET message_seq=(SELECT seq FROM chat_messages '+
     'WHERE sender_id=? AND client_message_id=?),updated_at=? WHERE id=? AND sender_id=? AND message_seq IS NULL')
     .bind(session.actorId,id,Date.now(),id,session.actorId)
   ]);
  }
  const saved=await env.DB.prepare('SELECT seq FROM chat_messages WHERE sender_id=? AND client_message_id=?')
   .bind(session.actorId,id).first();
  if(!saved)return reply({error:'Mensaje no confirmado'},503,origin);
  if(!existing)try{
   await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM)).fetch(
    'https://internal/chat-media-message-ready',{method:'POST',body:JSON.stringify({seq:saved.seq})});
  }catch{/* Next Chat snapshot loads already-committed messages. */}
  return reply({ok:true,seq:saved.seq,media:publicMedia(row)},existing?200:201,origin);
 }catch{return reply({error:'No se pudo publicar el archivo en Chat'},503,origin);}
}
/** One batched metadata lookup shared by member, Admin and realtime events.
 * No second message database, and never expose an R2 key or private grant. */
export async function decorateChatMessages(env,messages){
 if(!messages.length)return messages;
 const ids=messages.map(x=>x.seq);
 const rows=(await env.DB.prepare(
  'SELECT message_seq,id,kind,mime_type,size_bytes,original_name FROM chat_media_objects '+
  "WHERE message_seq IN ("+ids.map(()=>'?').join(',')+") AND status='ready'"
 ).bind(...ids).all()).results||[];
 const media=new Map(rows.map(row=>[row.message_seq,{
  assetId:row.id,kind:row.kind,mimeType:row.mime_type,sizeBytes:row.size_bytes,
  name:row.original_name||''
 }]));
 return messages.map(message=>media.has(message.seq)?
  {...message,text:'',media:media.get(message.seq)}:message);
}
export async function grantChatMedia(env,id,origin){
 const row=await env.DB.prepare('SELECT a.id,a.kind,a.mime_type,a.size_bytes,a.original_name FROM chat_media_objects a '+
  'JOIN chat_messages m ON m.seq=a.message_seq AND m.deleted_at IS NULL '+
  "WHERE a.id=? AND a.status='ready'").bind(id).first();
 if(!row)return reply({error:'Archivo no encontrado'},404,origin);
 const bytes=crypto.getRandomValues(new Uint8Array(32));
 const token=btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 await env.DB.prepare('INSERT INTO chat_media_grants(token_hash,media_id,expires_at) VALUES(?,?,?)')
  .bind(await sha256Hex(token),id,Date.now()+GRANT_MS).run();
 return reply({url:'https://havana-nice-v2-dev.soloaplicaciones97.workers.dev/api/chat/media/'+id+
  '/file?token='+encodeURIComponent(token)},200,origin);
}
export async function readChatMedia(request,env,id,url,origin){
 const token=url.searchParams.get('token');
 if(!token||!/^[a-zA-Z0-9_-]{40,100}$/.test(token))return reply({error:'Acceso denegado'},403,origin);
 const row=await env.DB.prepare('SELECT a.object_key,a.mime_type,a.size_bytes FROM chat_media_grants g '+
  'JOIN chat_media_objects a ON a.id=g.media_id AND a.status=\'ready\' '+
  'JOIN chat_messages m ON m.seq=a.message_seq AND m.deleted_at IS NULL '+
  'WHERE g.token_hash=? AND g.media_id=? AND g.expires_at>?')
  .bind(await sha256Hex(token),id,Date.now()).first();
 if(!row)return reply({error:'Permiso caducado'},403,origin);
 const range=request.headers.get('range');
 if(range&&!/^bytes=\d*-\d*$/.test(range))return reply({error:'Rango inválido'},416,origin);
 const object=await env.MEDIA_BUCKET.get(row.object_key,range?{range:request.headers}:{});
 if(!object)return reply({error:'Archivo no disponible'},404,origin);
 const headers=new Headers({'content-type':row.mime_type,'accept-ranges':'bytes',
  'cache-control':'private, no-store','x-content-type-options':'nosniff',
  'content-security-policy':"default-src 'none'; sandbox",
  'referrer-policy':'no-referrer','content-disposition':'inline',
  'access-control-allow-origin':origin||'https://havana-nice-v2-dev.pages.dev','vary':'Origin'});
 let status=200;
 if(range&&object.range&&typeof object.range.offset==='number'&&typeof object.range.length==='number'){
  const first=object.range.offset;
  headers.set('content-range','bytes '+first+'-'+(first+object.range.length-1)+'/'+object.size);
  headers.set('content-length',String(object.range.length));
  status=206;
 }else headers.set('content-length',String(object.size));
 return new Response(request.method==='HEAD'?null:object.body,{status,headers});
}
export async function handleChatMedia(request,env,url,origin,session){
 const path=url.pathname;
 const idMatch=/^\/api\/chat\/media\/([0-9a-f-]{36})(?:\/(content|send|complete|grant|file|parts\/(\d+)))?$/.exec(path);
 if(path==='/api/chat/media/status'&&request.method==='GET')
  return reply({enabled:!!env.MEDIA_BUCKET,maxFilesPerSend:5,
   storage:await familyStorageUsage(env)},200,origin);
 if(path==='/api/chat/media/start'&&request.method==='POST')
  return startChatMedia(request,env,session,origin);
 if(!idMatch||!UUID.test(idMatch[1]))return reply({error:'Ruta no válida'},404,origin);
 const [,id,operation,part]=idMatch;
 if(!operation&&request.method==='GET')return chatMediaStatus(env,session,id,origin);
 if(operation==='content'&&request.method==='PUT')return uploadChatDirect(request,env,session,id,origin);
 if(part&&request.method==='PUT')return uploadChatPart(request,env,session,id,Number(part),origin);
 if(operation==='complete'&&request.method==='POST')return completeChatMedia(env,session,id,origin);
 if(operation==='send'&&request.method==='POST')return sendChatMedia(env,session,id,origin);
 if(operation==='grant'&&request.method==='GET')return grantChatMedia(env,id,origin);
 return reply({error:'Método no permitido'},405,origin);
}
