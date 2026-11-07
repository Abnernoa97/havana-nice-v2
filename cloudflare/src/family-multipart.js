// HAVANA NICE V2 · one private multipart R2 transfer for large originals; no transcoding.
// Only the already-authorized Admin may invoke these routes. No S3 keys in PWA.
import {FAMILY_STORAGE_STOP_BYTES,reserveFamilyStorage,releaseFamilyStorage} from './family-quota.js';

export const FAMILY_PART_BYTES=5*1024*1024;
const SESSION_LIFETIME=6*60*60*1000;
const MULTIPART_FORMATS=new Map([['video/mp4','video'],['video/quicktime','video'],
 ['image/jpeg','photo'],['image/png','photo'],['image/webp','photo'],
 ['image/heic','photo'],['image/heif','photo']]);
function reply(data,status=200){
 return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store','referrer-policy':'no-referrer'}});
}
export function familyMultipartRoute(path){
 const matched=/^\/api\/family\/admin\/albums\/(member(?::|%3A)[a-z0-9_-]{1,64})\/multipart(?:\/([0-9a-f-]{36})(?:\/(parts\/([1-9][0-9]{0,3})|complete))?)?$/i.exec(path);
 if(!matched)return null;
 const id=matched[2]||null;
 if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return null;
 return {actorId:decodeURIComponent(matched[1]),id,part:matched[4]?Number(matched[4]):null,
  complete:!!matched[3]&&matched[3]==='complete'};
}
async function session(env,route){
 if(!route.id)return null;
 return env.DB.prepare('SELECT id,actor_id,object_key,upload_id,mime_type,size_bytes,expires_at '+
  'FROM family_upload_sessions WHERE id=? AND actor_id=?')
  .bind(route.id,route.actorId).first();
}
export async function startFamilyMultipart(request,env,route){
 let body;
 try{body=await request.json();}catch{return reply({error:'Datos de carga inválidos'},400);}
 const mime=body?.mimeType;
 const size=body?.sizeBytes;
 if(!MULTIPART_FORMATS.has(mime)||
  !Number.isSafeInteger(size)||size<2*FAMILY_PART_BYTES||size>FAMILY_STORAGE_STOP_BYTES)
  return reply({error:'Formato no permitido o archivo mayor que el espacio total de 9.5 GB'},413);
 const member=await env.DB.prepare('SELECT actor_id FROM chat_members WHERE actor_id=? AND active=1')
  .bind(route.actorId).first();
 if(!member)return reply({error:'Integrante no autorizado'},404);
 // Abort expired R2 drafts before releasing their budget reservation.
 const expired=await env.DB.prepare('SELECT id,actor_id,object_key,upload_id FROM family_upload_sessions WHERE expires_at<? LIMIT 20')
  .bind(Date.now()).all();
 for(const old of expired.results||[]){
  try{
   await env.MEDIA_BUCKET.resumeMultipartUpload(old.object_key,old.upload_id).abort();
   await env.DB.prepare('DELETE FROM family_upload_sessions WHERE id=?').bind(old.id).run();
  }catch{ /* Keep the reservation until R2 confirms an abort. */ }
 }
 const reservation=await reserveFamilyStorage(env,size);
 if(!reservation)return reply({error:'Almacenamiento Familia casi lleno: límite preventivo 9.5 GB. Borra archivos para liberar espacio.'},409);
 const id=crypto.randomUUID(),key='family/'+encodeURIComponent(route.actorId)+'/'+id;
 let multipart;
 try{
  multipart=await env.MEDIA_BUCKET.createMultipartUpload(key,{
   httpMetadata:{contentType:mime},customMetadata:{module:'familia-v2',actorId:route.actorId}
  });
  await env.DB.batch([
   env.DB.prepare('INSERT INTO family_upload_sessions(id,actor_id,object_key,upload_id,mime_type,size_bytes,expires_at) VALUES(?,?,?,?,?,?,?)')
    .bind(id,route.actorId,key,multipart.uploadId,mime,size,Date.now()+SESSION_LIFETIME),
   env.DB.prepare('DELETE FROM family_upload_reservations WHERE id=?').bind(reservation)
  ]);
  return reply({id,partSize:FAMILY_PART_BYTES,partCount:Math.ceil(size/FAMILY_PART_BYTES)},201);
 }catch{
  if(multipart)await multipart.abort().catch(()=>{});
  return reply({error:'No se pudo preparar la carga privada'},503);
 }finally{
  // Idempotent: successful starts moved the reservation to family_upload_sessions.
  await releaseFamilyStorage(env,reservation);
 }
}
/** Resumable status, scoped to the same Admin and actor. Never return R2 keys. */
export async function familyMultipartStatus(env,route){
 const saved=await session(env,route);
 if(!saved){
  // The final response may have been lost after R2+D1 committed the video.
  // Confirm the exact original ID before another attempt can duplicate it.
  const done=await env.DB.prepare(
   'SELECT id FROM family_media WHERE id=? AND actor_id=?'
  ).bind(route.id,route.actorId).first();
  return done?reply({id:done.id,complete:true}):reply({error:'Transferencia no encontrada'},404);
 }
 if(saved.expires_at<=Date.now())return reply({error:'Transferencia caducada'},410);
 const parts=await env.DB.prepare(
  'SELECT part_number FROM family_upload_parts WHERE session_id=? ORDER BY part_number'
 ).bind(saved.id).all();
 return reply({id:saved.id,complete:false,partSize:FAMILY_PART_BYTES,
  partCount:Math.ceil(saved.size_bytes/FAMILY_PART_BYTES),
  completedParts:(parts.results||[]).map(row=>row.part_number)});
}
export async function uploadFamilyPart(request,env,route){
 const s=await session(env,route);
 if(!s||s.expires_at<=Date.now())return reply({error:'Carga caducada'},404);
 const count=Math.ceil(s.size_bytes/FAMILY_PART_BYTES),number=route.part;
 if(!Number.isInteger(number)||number<1||number>count)return reply({error:'Parte inválida'},400);
 const required=Math.min(FAMILY_PART_BYTES,s.size_bytes-(number-1)*FAMILY_PART_BYTES);
 const size=Number(request.headers.get('content-length'));
 if(!Number.isSafeInteger(size)||size!==required||!request.body)
  return reply({error:'Tamaño de la parte incorrecto'},400);
 try{
  const upload=env.MEDIA_BUCKET.resumeMultipartUpload(s.object_key,s.upload_id);
  const saved=await upload.uploadPart(number,request.body);
  await env.DB.prepare('INSERT INTO family_upload_parts(session_id,part_number,etag,size_bytes) VALUES(?,?,?,?) '+
   'ON CONFLICT(session_id,part_number) DO UPDATE SET etag=excluded.etag,size_bytes=excluded.size_bytes')
   .bind(s.id,number,saved.etag,size).run();
  return reply({ok:true,partNumber:number});
 }catch{return reply({error:'Fallo de red al recibir una parte; puedes reintentarla'},503);}
}
export async function completeFamilyMultipart(env,route){
 const s=await session(env,route);
 if(!s||s.expires_at<=Date.now())return reply({error:'Carga caducada'},404);
 const parts=await env.DB.prepare('SELECT part_number,etag,size_bytes FROM family_upload_parts WHERE session_id=? ORDER BY part_number')
  .bind(s.id).all();
 const rows=parts.results||[],count=Math.ceil(s.size_bytes/FAMILY_PART_BYTES);
 if(rows.length!==count||rows.some((r,i)=>r.part_number!==i+1||
   r.size_bytes!==Math.min(FAMILY_PART_BYTES,s.size_bytes-i*FAMILY_PART_BYTES)))
  return reply({error:'Faltan fragmentos del video'},409);
 try{
  const object=await env.MEDIA_BUCKET.resumeMultipartUpload(s.object_key,s.upload_id)
   .complete(rows.map(row=>({partNumber:row.part_number,etag:row.etag})));
  if(!object||object.size!==s.size_bytes){
   await env.MEDIA_BUCKET.delete(s.object_key).catch(()=>{});
   return reply({error:'El tamaño del video no coincide'},400);
  }
  try{
   await env.DB.batch([
    env.DB.prepare('INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?, ?,?,?,0,0,?)')
     .bind(s.id,s.actor_id,MULTIPART_FORMATS.get(s.mime_type),s.object_key,s.mime_type,s.size_bytes,new Date().toISOString()),
    env.DB.prepare('DELETE FROM family_upload_sessions WHERE id=? AND actor_id=?').bind(s.id,s.actor_id)
   ]);
  }catch(e){
   await env.MEDIA_BUCKET.delete(s.object_key).catch(()=>{});
   throw e;
  }
  return reply({ok:true,id:s.id,kind:MULTIPART_FORMATS.get(s.mime_type)},201);
 }catch{return reply({error:'No se pudo finalizar el video privado'},503);}
}
export async function abortFamilyMultipart(env,route){
 const s=await session(env,route);
 if(!s)return reply({ok:true});
 try{
  await env.MEDIA_BUCKET.resumeMultipartUpload(s.object_key,s.upload_id).abort();
  await env.DB.prepare('DELETE FROM family_upload_sessions WHERE id=? AND actor_id=?')
   .bind(s.id,s.actor_id).run();
  return reply({ok:true});
 }catch{return reply({error:'No se pudo cancelar la carga'},503);}
}
export async function handleFamilyMultipart(request,env,route){
 if(!env.MEDIA_BUCKET)return reply({error:'Almacenamiento no disponible'},503);
 if(!route.id&&request.method==='POST')return startFamilyMultipart(request,env,route);
 if(route.id&&route.part!==null&&request.method==='POST')return uploadFamilyPart(request,env,route);
 if(route.id&&route.complete&&request.method==='POST')return completeFamilyMultipart(env,route);
 if(route.id&&route.part===null&&!route.complete&&request.method==='GET')
  return familyMultipartStatus(env,route);
 if(route.id&&route.part===null&&!route.complete&&request.method==='DELETE')
  return abortFamilyMultipart(env,route);
 return reply({error:'Método no permitido'},405);
}
