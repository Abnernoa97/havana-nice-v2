// HAVANA NICE V2 · private Familia R2 gateway.
// No public bucket, S3 keys, browser cookies, shared Chat files or new login.
import {FAMILY_STORAGE_STOP_BYTES,reserveFamilyStorage,releaseFamilyStorage} from './family-quota.js';
import {sha256Hex} from '../../shared/crypto-helpers.js';
const GRANT_LIFETIME_MS=10*60*1000;
const MEDIA_TYPES={
 'image/jpeg':'photo','image/png':'photo','image/webp':'photo',
 'image/heic':'photo','image/heif':'photo',
 'video/mp4':'video','video/quicktime':'video'
};
const GRANT_PATH='/api/family/media/';

function json(data,status=200,origin=''){
 return new Response(JSON.stringify(data),{status,headers:{
  'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'access-control-allow-origin':origin||'https://havana-nice-v2-dev.pages.dev',
  'vary':'Origin','referrer-policy':'no-referrer'
 }});
}
/** Issue grants in one D1 transaction instead of one network round trip per photo.
 * Token hashes and expiration remain private server-side. */
export async function issueFamilyGrants(env,items){
 if(!items.length)return [];
 if(items.length>160)throw new Error('Too many private media grants');
 const expiresAt=Date.now()+GRANT_LIFETIME_MS;
 const tokens=items.map(()=>crypto.randomUUID().replace(/-/g,''));
 const hashes=await Promise.all(tokens.map(token=>sha256Hex(token)));
 await env.DB.batch(items.map(({id,variant},index)=>
  env.DB.prepare('INSERT INTO family_media_grants(token_hash,media_id,expires_at,variant) VALUES(?,?,?,?)')
   .bind(hashes[index],id,expiresAt,variant)));
 return tokens.map(token=>GRANT_PATH+token);
}
function secureFileHeaders(object,mime,origin,rangeRequested){
 const h=new Headers({
  'content-type':mime,
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
  'content-security-policy':"default-src 'none'; sandbox",
  'content-disposition':'inline',
  'referrer-policy':'no-referrer',
  'accept-ranges':'bytes',
  'access-control-allow-origin':origin||'https://havana-nice-v2-dev.pages.dev',
  'vary':'Origin'
 });
 // R2 returns the actual byte interval, not just the client-supplied request.
 if(rangeRequested&&object.range&&typeof object.range.offset==='number'&&typeof object.range.length==='number'){
  const start=object.range.offset,end=start+object.range.length-1;
  h.set('content-range','bytes '+start+'-'+end+'/'+object.size);
  h.set('content-length',String(object.range.length));
  return {headers:h,status:206};
 }
 h.set('content-length',String(object.size));
 return {headers:h,status:200};
}
export async function readFamilyGrant(request,env,url,origin){
 if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Método no permitido'},405,origin);
 if(!env.MEDIA_BUCKET)return json({error:'Archivos no disponibles'},503,origin);
 const token=url.pathname.slice(GRANT_PATH.length);
 if(!/^[a-f0-9]{32}$/.test(token))return json({error:'Archivo no encontrado'},404,origin);
 const row=await env.DB.prepare(
  'SELECT f.object_key,f.mime_type,f.poster_key,f.poster_mime,g.variant FROM family_media_grants g '+
  'JOIN family_media f ON f.id=g.media_id '+
  'JOIN chat_members m ON m.actor_id=f.actor_id AND m.active=1 '+
  'WHERE g.token_hash=? AND g.expires_at>?'
 ).bind(await sha256Hex(token),Date.now()).first();
 if(!row)return json({error:'Enlace caducado o archivo no autorizado'},404,origin);
 const poster=row.variant==='poster';
 if(poster&&(!row.poster_key||!row.poster_mime))
  return json({error:'Portada no disponible'},404,origin);
 const objectKey=poster?row.poster_key:row.object_key;
 const mime=poster?row.poster_mime:row.mime_type;
 const obj=await env.MEDIA_BUCKET.get(objectKey,
  !poster&&request.headers.has('range')?{range:request.headers}:{});
 if(!obj)return json({error:'Archivo no encontrado'},404,origin);
 const options=secureFileHeaders(obj,mime,origin,!poster&&request.headers.has('range'));
 return new Response(request.method==='HEAD'?null:obj.body,options);
}
export async function pruneExpiredFamilyGrants(env){
 // Reclaim expired, hashed capabilities without deleting any photographs or videos.
 await env.DB.prepare('DELETE FROM family_media_grants WHERE expires_at<=?')
  .bind(Date.now()).run();
}
export async function listFamilyMedia(env,actorId){
 await pruneExpiredFamilyGrants(env);
 const member=await env.DB.prepare('SELECT actor_id FROM chat_members WHERE actor_id=? AND active=1')
  .bind(actorId).first();
 if(!member)return null;
 // Explicitly bounded; pagination and thumbnails are separate future milestones.
 const rows=await env.DB.prepare(
  'SELECT id,kind,poster_key FROM family_media WHERE actor_id=? '+
  'ORDER BY position ASC,created_at DESC,id DESC LIMIT 80'
 ).bind(actorId).all();
 const media=rows.results||[];
 const grants=await issueFamilyGrants(env,media.flatMap(row=>[
  {id:row.id,variant:'original'},
  ...(row.kind==='video'&&row.poster_key?[{id:row.id,variant:'poster'}]:[])
 ]));
 let offset=0;
 return media.map(row=>{
  const fileUrl=grants[offset++];
  const thumbnailUrl=row.kind==='photo'?fileUrl:
   row.poster_key?grants[offset++]:null;
  return {id:row.id,kind:row.kind,fileUrl,thumbnailUrl,
   alt:row.kind==='video'?'Video del álbum':'Foto del álbum'};
 });
}
/** Read-only acknowledgement for a specific client-generated upload ID.
 * Enables safe retries when the phone lost the HTTP response after R2 completed.
 * Same existing Admin authorization, album ownership and private metadata. */
export async function checkFamilyOriginalUpload(env,actorId,mediaId,origin){
 const row=await env.DB.prepare(
  'SELECT id,size_bytes,mime_type FROM family_media WHERE id=? AND actor_id=?'
 ).bind(mediaId,actorId).first();
 return row?json({id:row.id,sizeBytes:row.size_bytes,mimeType:row.mime_type},200,origin):
  json({error:'Esta transferencia aún no terminó'},404,origin);
}
export async function uploadFamilyMedia(request,env,actorId,origin){
 if(!env.MEDIA_BUCKET)return json({error:'Almacenamiento no disponible'},503,origin);
 const contentType=(request.headers.get('content-type')||'').split(';')[0].toLowerCase().trim();
 const kind=MEDIA_TYPES[contentType];
 if(!kind)return json({error:'Formato no permitido'},415,origin);
 const declared=Number(request.headers.get('content-length'));
 if(!Number.isSafeInteger(declared)||declared<=0)return json({error:'Se necesita tamaño del archivo'},411,origin);
 if(declared>FAMILY_STORAGE_STOP_BYTES)return json({error:'El archivo supera el espacio máximo de Familia (9.5 GB)'},413,origin);
 // Larger originals use the existing R2 multipart API, not a second upload service.
 if(declared>15*1024*1024)return json({error:'Utiliza la transferencia por partes para este archivo'},413,origin);
 if(!request.body)return json({error:'Archivo vacío'},400,origin);
 const member=await env.DB.prepare('SELECT actor_id FROM chat_members WHERE actor_id=? AND active=1')
  .bind(actorId).first();
 if(!member)return json({error:'Integrante no autorizado'},404,origin);
 const clientId=request.headers.get('x-havana-v2-upload-id');
 if(clientId&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId))
  return json({error:'Identificador de carga inválido'},400,origin);
 const id=clientId||crypto.randomUUID();
 if(clientId){
  const existing=await env.DB.prepare(
   'SELECT actor_id,mime_type,size_bytes FROM family_media WHERE id=?'
  ).bind(id).first();
  if(existing){
   if(existing.actor_id===actorId&&existing.mime_type===contentType&&existing.size_bytes===declared)
    return json({ok:true,id,kind,actorId,alreadySaved:true},200,origin);
   return json({error:'Identificador de carga ya utilizado'},409,origin);
  }
 }
 const reservation=await reserveFamilyStorage(env,declared,id);
 if(!reservation)return json({error:'Almacenamiento Familia casi lleno (límite 9.5 GB). Elimina archivos para liberar espacio.'},409,origin);
 const key='family/'+encodeURIComponent(actorId)+'/'+id;
 try{
  const object=await env.MEDIA_BUCKET.put(key,request.body,{
   httpMetadata:{contentType},customMetadata:{module:'familia-v2',actorId}
  });
  // Never trust only the client-provided Content-Length for quotas or D1 metadata.
  if(!object||object.size!==declared){
   await env.MEDIA_BUCKET.delete(key).catch(()=>{});
   return json({error:'El tamaño recibido no coincide con el archivo original'},400,origin);
  }
  try{
   await env.DB.prepare(
    'INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) '+
    'VALUES(?,?,?,?,?,?,0,0,?)'
   ).bind(id,actorId,kind,key,contentType,declared,new Date().toISOString()).run();
  }catch(error){
   await env.MEDIA_BUCKET.delete(key).catch(()=>{});
   throw error;
  }
  return json({ok:true,id,kind,actorId},201,origin);
 }catch{return json({error:'No se pudo guardar el archivo privado'},503,origin);}
 finally{await releaseFamilyStorage(env,reservation);}
}
/** A real frame preview of the original video, stored beside it in the same
 * private R2 bucket. Only the existing Admin session may call this endpoint. */
export async function uploadFamilyPoster(request,env,actorId,mediaId,origin){
 if(!env.MEDIA_BUCKET)return json({error:'Almacenamiento no disponible'},503,origin);
 const mime=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(mime!=='image/webp'&&mime!=='image/jpeg')
  return json({error:'La portada debe ser una imagen WebP o JPEG'},415,origin);
 const length=Number(request.headers.get('content-length'));
 if(!Number.isSafeInteger(length)||length<64||length>384*1024)
  return json({error:'Portada demasiado grande (máximo 384 KiB)'},413,origin);
 const row=await env.DB.prepare(
  "SELECT f.poster_key FROM family_media f JOIN chat_members m ON m.actor_id=f.actor_id "+
  "AND m.active=1 WHERE f.id=? AND f.actor_id=? AND f.kind='video'"
 ).bind(mediaId,actorId).first();
 if(!row)return json({error:'El video no pertenece a un álbum activo'},404,origin);
 let bytes;
 try{bytes=new Uint8Array(await request.arrayBuffer());}
 catch{return json({error:'No se pudo leer la portada'},400,origin);}
 if(bytes.byteLength!==length)return json({error:'Tamaño de portada incorrecto'},400,origin);
 const jpeg=mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=mime==='image/webp'&&
  String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&
  String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!jpeg&&!webp)return json({error:'La imagen de portada no coincide con su formato'},415,origin);
 const reservation=await reserveFamilyStorage(env,length);
 if(!reservation)return json({error:'Almacenamiento Familia casi lleno (límite 9.5 GB)'},409,origin);
 const key='family/'+encodeURIComponent(actorId)+'/'+mediaId+'.poster.'+
  crypto.randomUUID()+(jpeg?'.jpg':'.webp');
 try{
  const saved=await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:mime},
   customMetadata:{module:'familia-v2',type:'video-poster'}});
  if(saved?.size!==bytes.byteLength){
   await env.MEDIA_BUCKET.delete(key).catch(()=>{});
   return json({error:'La portada recibida está incompleta'},503,origin);
  }
  try{
   await env.DB.prepare("UPDATE family_media SET poster_key=?,poster_mime=?,poster_size_bytes=? "+
    "WHERE id=? AND actor_id=? AND kind='video'")
    .bind(key,mime,bytes.byteLength,mediaId,actorId).run();
  }catch(e){
   await env.MEDIA_BUCKET.delete(key).catch(()=>{});
   throw e;
  }
  // Replacing a poster must not leave old derivatives in private R2.
  if(row.poster_key&&row.poster_key!==key)
   await env.MEDIA_BUCKET.delete(row.poster_key).catch(()=>{});
  return json({ok:true,id:mediaId},201,origin);
 }catch{return json({error:'No se pudo guardar la portada privada'},503,origin);}
 finally{await releaseFamilyStorage(env,reservation);}
}
/** Administrator can delete an original and its D1/grant records, never a Chat asset. */
export async function deleteFamilyMedia(env,actorId,mediaId,origin){
 if(!env.MEDIA_BUCKET)return json({error:'Almacenamiento no disponible'},503,origin);
 const row=await env.DB.prepare(
  'SELECT f.object_key,f.poster_key FROM family_media f JOIN chat_members m '+
  'ON m.actor_id=f.actor_id AND m.active=1 WHERE f.id=? AND f.actor_id=?'
 ).bind(mediaId,actorId).first();
 if(!row)return json({error:'Archivo no encontrado'},404,origin);
 try{
  // Delete R2 first: if storage fails, the D1 record remains retryable.
  await env.MEDIA_BUCKET.delete([row.object_key,...(row.poster_key?[row.poster_key]:[])]);
  await env.DB.prepare('DELETE FROM family_media WHERE id=? AND actor_id=?')
   .bind(mediaId,actorId).run();
  return json({ok:true,id:mediaId},200,origin);
 }catch{return json({error:'No se pudo borrar el archivo privado'},503,origin);}
}
/** Exactly one cover per album; only an authorized existing photo may be selected. */
export async function selectFamilyCover(env,actorId,mediaId,origin){
 const row=await env.DB.prepare(
  "SELECT f.id FROM family_media f JOIN chat_members m ON m.actor_id=f.actor_id AND m.active=1 "+
  "WHERE f.id=? AND f.actor_id=? AND f.kind='photo'"
 ).bind(mediaId,actorId).first();
 if(!row)return json({error:'Selecciona una fotografía válida del álbum'},404,origin);
 try{
  await env.DB.batch([
   env.DB.prepare('UPDATE family_media SET is_cover=0 WHERE actor_id=?').bind(actorId),
   env.DB.prepare('UPDATE family_media SET is_cover=1 WHERE actor_id=? AND id=? AND kind=?')
    .bind(actorId,mediaId,'photo')
  ]);
  return json({ok:true,id:mediaId},200,origin);
 }catch{return json({error:'No se pudo actualizar la portada'},503,origin);}
}
export function familyMediaItemRoute(pathname){
 const media=/^\/api\/family\/admin\/albums\/(member(?::|%3A)[a-z0-9_-]{1,64})\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/(cover|poster))?$/i.exec(pathname);
 return media?{actorId:decodeURIComponent(media[1]),id:media[2],cover:media[4]==='cover',poster:media[4]==='poster'}:null;
}
export function familyAlbumRoute(pathname){
 const media=/^\/api\/family\/(admin\/)?albums\/(member(?::|%3A)[a-z0-9_-]{1,64})\/media$/i.exec(pathname);
 return media?{admin:!!media[1],actorId:decodeURIComponent(media[2])}:null;
}
export async function familyAlbumSummaries(env,rows){
 await pruneExpiredFamilyGrants(env);
 const albums=rows.map(row=>({actorId:row.actor_id,name:row.display_name,
  photoCount:0,videoCount:0,coverUrl:null,mediaReady:true}));
 const byActor=new Map(albums.map(a=>[a.actorId,a]));
 const counts=await env.DB.prepare(
  'SELECT actor_id,kind,COUNT(*) total FROM family_media GROUP BY actor_id,kind'
 ).all();
 for(const row of counts.results||[]){
  const album=byActor.get(row.actor_id);
  if(album){if(row.kind==='photo')album.photoCount=row.total;
   else if(row.kind==='video')album.videoCount=row.total;}
 }
 const covers=await env.DB.prepare(
  "SELECT f.id,f.actor_id,f.kind FROM family_media f WHERE "+
  "(f.kind='photo' OR (f.kind='video' AND f.poster_key IS NOT NULL)) AND "+
  "f.id=(SELECT f2.id FROM family_media f2 WHERE f2.actor_id=f.actor_id AND "+
  "(f2.kind='photo' OR (f2.kind='video' AND f2.poster_key IS NOT NULL)) "+
  "ORDER BY CASE WHEN f2.kind='photo' THEN 0 ELSE 1 END ASC,"+
  "f2.is_cover DESC,f2.position ASC,f2.created_at ASC,f2.id ASC LIMIT 1)"
 ).all();
 const coverRows=(covers.results||[]).filter(row=>byActor.has(row.actor_id));
 const urls=await issueFamilyGrants(env,coverRows.map(row=>({
  id:row.id,variant:row.kind==='video'?'poster':'original'
 })));
 coverRows.forEach((row,index)=>{byActor.get(row.actor_id).coverUrl=urls[index];});
 return albums;
}
