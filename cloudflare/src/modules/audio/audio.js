// HAVANA NICE V2 · one private audio catalog. Never expose R2 keys or admin secrets.
// Members see published tracks; Admin controls uploads and deletion.
// The system player uses short-lived, hashed, read-only media capabilities.
import {verifyAdminSession} from '../admin/admin-auth.js';
import {sha256Hex} from '../../shared/crypto-helpers.js';
import {reserveFamilyStorage,releaseFamilyStorage} from '../family/family-quota.js';
import {notifyFamilyClients} from '../family/family-realtime.js';
const AUDIO_MIME=new Set(['audio/mpeg','audio/mp4','audio/aac','audio/x-m4a','audio/wav','audio/wave']);
const COVER_MIME=new Set(['image/jpeg','image/png','image/webp']);
const GRANT_TTL=60*60*1000; // MediaSession artwork and stream can start without Authorization header.
const MAX_AUDIO=30*1024*1024,MAX_COVER=400*1024,MAX_TRACKS=100;
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TOKEN=/^[a-f0-9]{32}$/;
const ORIGIN='https://havana-nice-v2.pages.dev';
const json=(value,status=200,origin='')=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private,no-store',
 'access-control-allow-origin':origin||ORIGIN,'vary':'Origin','referrer-policy':'no-referrer'}
});
const headers=(origin,contentType)=>new Headers({
 'content-type':contentType,'cache-control':'private,no-store','x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer','accept-ranges':'bytes',
 'access-control-allow-origin':origin||ORIGIN,'vary':'Origin'
});
function field(request,name,fallback='',max=120){
 const raw=request.headers.get(name);
 if(!raw)return fallback;
 try{return decodeURIComponent(raw).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max)||fallback;}
 catch{return fallback;}
}
async function issue(env,rows){
 if(!rows.length)return [];
 const expire=Date.now()+GRANT_TTL;
 const pairs=rows.flatMap(row=>[{id:row.id,variant:'audio'},
  ...(row.cover_key?[{id:row.id,variant:'cover'}]:[])]);
 const tokens=pairs.map(()=>crypto.randomUUID().replace(/-/g,''));
 const hashes=await Promise.all(tokens.map(sha256Hex));
 // Group grants into bounded multi-row inserts. One atomic D1 batch now holds
 // up to 8 statements for 100 tracks with covers, instead of 200 statements.
 const statements=[];
 for(let start=0;start<pairs.length;start+=25){
  const chunk=pairs.slice(start,start+25);
  const values=chunk.map(()=>'(?,?,?,?)').join(',');
  const bindings=chunk.flatMap((row,i)=>[hashes[start+i],row.id,row.variant,expire]);
  statements.push(env.DB.prepare(
   'INSERT INTO audio_media_grants(token_hash,track_id,variant,expires_at) VALUES '+values
  ).bind(...bindings));
 }
 await env.DB.batch(statements);
 let cursor=0;
 return rows.map(row=>({
  id:row.id,title:row.title,artist:row.artist,album:row.album,position:row.position,
  sizeBytes:row.size_bytes,hasCover:!!row.cover_key,
  audioUrl:'/api/audio/media/'+tokens[cursor++],
  coverUrl:row.cover_key?'/api/audio/media/'+tokens[cursor++]:null
 }));
}
async function cleanup(env){
 if(!env.MEDIA_BUCKET)return;
 const rows=(await env.DB.prepare(
  'SELECT object_key FROM audio_delete_queue ORDER BY queued_at ASC LIMIT 15'
 ).all()).results||[];
 for(const row of rows){
  try{await env.MEDIA_BUCKET.delete(row.object_key);
   await env.DB.prepare('DELETE FROM audio_delete_queue WHERE object_key=?')
    .bind(row.object_key).run();
  }catch{/* Object remains accounted for, available to retry later. */}
 }
}
async function readGrant(request,env,url,origin){
 if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'Método no permitido'},405,origin);
 const token=url.pathname.slice('/api/audio/media/'.length);
 if(!TOKEN.test(token))return json({error:'Archivo no disponible'},404,origin);
 const row=await env.DB.prepare(
  'SELECT t.object_key,t.mime_type,t.cover_key,t.cover_mime,g.variant FROM audio_media_grants g '+
  'JOIN audio_tracks t ON t.id=g.track_id WHERE g.token_hash=? AND g.expires_at>? '+
  "AND t.published=1"
 ).bind(await sha256Hex(token),Date.now()).first();
 if(!row||!env.MEDIA_BUCKET)return json({error:'Enlace caducado o archivo no disponible'},404,origin);
 const isCover=row.variant==='cover';
 if(isCover&&!row.cover_key)return json({error:'Sin portada'},404,origin);
 const object=await env.MEDIA_BUCKET.get(isCover?row.cover_key:row.object_key,
  !isCover&&request.headers.has('range')?{range:request.headers}:{});
 if(!object)return json({error:'Archivo no disponible'},404,origin);
 const h=headers(origin,isCover?row.cover_mime:row.mime_type);
 let status=200;
 if(!isCover&&request.headers.has('range')&&object.range&&
  typeof object.range.offset==='number'&&typeof object.range.length==='number'){
  const start=object.range.offset,end=start+object.range.length-1;
  h.set('content-range',`bytes ${start}-${end}/${object.size}`);
  h.set('content-length',String(object.range.length));status=206;
 }else h.set('content-length',String(object.size));
 return new Response(request.method==='HEAD'?null:object.body,{status,headers:h});
}
// The 15-minute Worker cron reclaims expired capabilities; never do housekeeping on Audio open.
// readGrant rejects expired tokens immediately even before their rows are deleted.
export async function cleanupExpiredAudioGrants(env,limit=2000){
 return env.DB.prepare(
  'DELETE FROM audio_media_grants WHERE token_hash IN ('+
  'SELECT token_hash FROM audio_media_grants WHERE expires_at<=? LIMIT ?)'
 ).bind(Date.now(),limit).run();
}
async function list(env,origin){
 const rows=(await env.DB.prepare(
  'SELECT id,title,artist,album,position,size_bytes,cover_key FROM audio_tracks '+
  'WHERE published=1 ORDER BY position ASC,created_at ASC LIMIT 100'
 ).all()).results||[];
 return json({tracks:await issue(env,rows)},200,origin);
}
async function uploadAudio(request,env,origin){
 if(!env.MEDIA_BUCKET)return json({error:'R2 no disponible'},503,origin);
 const mime=(request.headers.get('content-type')||'').split(';')[0].toLowerCase();
 if(!AUDIO_MIME.has(mime))return json({error:'Audio no compatible; utiliza MP3, M4A, AAC o WAV'},415,origin);
 const size=Number(request.headers.get('content-length')||0);
 if(!Number.isSafeInteger(size)||size<128||size>MAX_AUDIO)return json({error:'Audio vacío o mayor de 30 MiB'},413,origin);
 const title=field(request,'x-audio-title','',120);
 if(!title)return json({error:'Falta el título'},400,origin);
 const artist=field(request,'x-audio-artist','HAVANA NICE',100);
 const album=field(request,'x-audio-album','HAVANA NICE',100);
 const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM audio_tracks').first();
 if(Number(count?.total||0)>=MAX_TRACKS)return json({error:'Máximo 100 canciones'},409,origin);
 const id=crypto.randomUUID(),key='audio/v2/original/'+id;
 const reservation=await reserveFamilyStorage(env,size,id);
 if(!reservation)return json({error:'No hay suficiente memoria privada disponible'},409,origin);
 try{
  const stored=await env.MEDIA_BUCKET.put(key,request.body,{
   httpMetadata:{contentType:mime},customMetadata:{module:'audio-havana-nice-v2'}
  });
  if(!stored||stored.size!==size){await env.MEDIA_BUCKET.delete(key);return json({error:'Tamaño incorrecto'},400,origin);}
  try{await env.DB.prepare(
   'INSERT INTO audio_tracks(id,title,artist,album,object_key,mime_type,size_bytes,created_at,position) '+
   'VALUES(?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),0)+100 FROM audio_tracks))'
  ).bind(id,title,artist,album,key,mime,size,Date.now()).run();}
  catch{
   await env.MEDIA_BUCKET.delete(key).catch(async()=>env.DB.prepare(
    'INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)'
   ).bind(key,size,Date.now()).run());
   return json({error:'No se pudo registrar el audio'},503,origin);
  }
  return json({id,ok:true},201,origin);
 }catch{return json({error:'No se pudo subir el audio'},503,origin);}
 finally{await releaseFamilyStorage(env,reservation);}
}
async function uploadCover(request,env,id,origin){
 if(!env.MEDIA_BUCKET)return json({error:'R2 no disponible'},503,origin);
 const mime=(request.headers.get('content-type')||'').split(';')[0].toLowerCase();
 const size=Number(request.headers.get('content-length')||0);
 if(!COVER_MIME.has(mime)||!Number.isSafeInteger(size)||size<32||size>MAX_COVER)
  return json({error:'Portada JPG, PNG o WebP de máximo 400 KiB'},415,origin);
 const track=await env.DB.prepare('SELECT cover_key,cover_size_bytes FROM audio_tracks WHERE id=?').bind(id).first();
 if(!track)return json({error:'Audio no encontrado'},404,origin);
 const bytes=new Uint8Array(await request.arrayBuffer());
 const jpg=mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=mime==='image/png'&&bytes.slice(0,4).every((v,i)=>v===[137,80,78,71][i]);
 const webp=mime==='image/webp'&&new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&
  new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
 if(bytes.length!==size||!jpg&&!png&&!webp)return json({error:'Imagen de portada inválida'},415,origin);
 const key='audio/v2/cover/'+id+'/'+crypto.randomUUID();
 const reservation=await reserveFamilyStorage(env,size,crypto.randomUUID());
 if(!reservation)return json({error:'Espacio insuficiente'},409,origin);
 let saved=false;
 try{
  await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:mime}});
  const old=track.cover_key;
  const batch=[];
  if(old)batch.push(env.DB.prepare(
   'INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)'
  ).bind(old,track.cover_size_bytes,Date.now()));
  batch.push(env.DB.prepare(
   'UPDATE audio_tracks SET cover_key=?,cover_mime=?,cover_size_bytes=? WHERE id=? AND cover_key IS ?'
  ).bind(key,mime,size,id,old));
  const result=await env.DB.batch(batch);
  if(!Number(result.at(-1)?.meta?.changes||0))throw Error('Conflict');
  saved=true;await cleanup(env);
  return json({ok:true},200,origin);
 }catch{
  if(!saved)await env.MEDIA_BUCKET.delete(key).catch(async()=>env.DB.prepare(
   'INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)'
  ).bind(key,size,Date.now()).run());
  return json({error:'No se pudo guardar la portada'},503,origin);
 }finally{await releaseFamilyStorage(env,reservation);}
}
async function removeTrack(env,id,origin){
 const row=await env.DB.prepare(
  'SELECT object_key,size_bytes,cover_key,cover_size_bytes FROM audio_tracks WHERE id=?'
 ).bind(id).first();
 if(!row)return json({error:'Audio no encontrado'},404,origin);
 const batch=[
  env.DB.prepare('INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)')
   .bind(row.object_key,row.size_bytes,Date.now()),
  ...(row.cover_key?[env.DB.prepare(
   'INSERT OR IGNORE INTO audio_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)'
  ).bind(row.cover_key,row.cover_size_bytes,Date.now())]:[]),
  env.DB.prepare('DELETE FROM audio_tracks WHERE id=?').bind(id)
 ];
 await env.DB.batch(batch);
 await cleanup(env);
 return json({ok:true},200,origin);
}
export async function handleAudioApi(request,env,url,origin,verifyMember,ctx){
 if(url.pathname.startsWith('/api/audio/media/')){
  try{return await readGrant(request,env,url,origin);}
  catch{return json({error:'Audio no disponible'},503,origin);}
 }
 const admin=url.pathname.startsWith('/api/audio/admin/');
 if(admin){
  if(!await verifyAdminSession(request,env))return json({error:'No autorizado'},401,origin);
 }else{
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!await verifyMember(env,token))return json({error:'No autorizado'},401,origin);
 }
 try{
  if(url.pathname===(admin?'/api/audio/admin/tracks':'/api/audio/tracks')&&request.method==='GET')
   return await list(env,origin);
  if(!admin)return json({error:'Método no permitido'},405,origin);
  let result;
  if(url.pathname==='/api/audio/admin/tracks'&&request.method==='POST')
   result=await uploadAudio(request,env,origin);
  const m=/^\/api\/audio\/admin\/tracks\/([0-9a-f-]{36})$/.exec(url.pathname);
  if(!result&&m&&ID.test(m[1])&&request.method==='DELETE')result=await removeTrack(env,m[1],origin);
  const cover=/^\/api\/audio\/admin\/tracks\/([0-9a-f-]{36})\/cover$/.exec(url.pathname);
  if(!result&&cover&&ID.test(cover[1])&&request.method==='POST')result=await uploadCover(request,env,cover[1],origin);
  if(!result)return json({error:'Ruta no encontrada'},404,origin);
  if(result.ok&&ctx?.waitUntil)ctx.waitUntil(notifyFamilyClients(env));
  return result;
 }catch{return json({error:'Audio temporalmente no disponible'},503,origin);}
}
