// HAVANA NICE V2 · isolated BOOK magazine; the same D1, private R2, admin and member sessions.
// It is not a second gallery engine, public bucket, or another Durable Object.
import {verifyAdminSession} from '../admin/admin-auth.js';
import {sha256Hex} from '../../shared/crypto-helpers.js';
import {reserveFamilyStorage,releaseFamilyStorage} from '../family/family-quota.js';
import {notifyFamilyClients} from '../family/family-realtime.js';

const MIMES=new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);
const MAX_BYTES=15*1024*1024;
const MAX_PAGES=80;
const MAX_OPTIMIZED_BYTES=5*1024*1024;
const GRANT_MS=10*60*1000;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[a-f0-9]{32}$/;
const MEDIA_ROUTE='/api/book/media/';
const reply=(body,status=200,origin='')=>new Response(JSON.stringify(body),{status,headers:{
 'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev','vary':'Origin',
 'referrer-policy':'no-referrer'
}});
const mediaHeader=(origin)=>({
 'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev',
 'vary':'Origin','referrer-policy':'no-referrer','cache-control':'private, no-store',
 'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox"
});
async function cleanupBookQueue(env){
 if(!env.MEDIA_BUCKET)return;
 const rows=(await env.DB.prepare('SELECT object_key FROM book_delete_queue ORDER BY queued_at LIMIT 20').all()).results||[];
 for(const row of rows){
  try{
   await env.MEDIA_BUCKET.delete(row.object_key);
   await env.DB.prepare('DELETE FROM book_delete_queue WHERE object_key=?').bind(row.object_key).run();
  }catch{} // Keep a durable queue when R2 is unavailable.
 }
}
async function issueBookGrants(env,rows,admin,variant){
 if(!rows.length)return [];
 const expiry=Date.now()+GRANT_MS;
 const tokens=rows.map(()=>crypto.randomUUID().replace(/-/g,''));
 const hashes=await Promise.all(tokens.map(sha256Hex));
 await env.DB.batch(rows.map((row,i)=>env.DB.prepare(
  'INSERT INTO book_media_grants(token_hash,page_id,admin_only,expires_at,variant) VALUES(?,?,?,?,?)'
 ).bind(hashes[i],row.id,admin?1:0,expiry,
  variant==='reader'&&row.optimized_key?'optimized':'original')));
 return tokens.map(t=>MEDIA_ROUTE+t);
}
async function listBook(env,admin,origin){
 // Old capability grants expire without retaining old copies of originals.
 await env.DB.prepare('DELETE FROM book_media_grants WHERE expires_at<=?').bind(Date.now()).run();
 const result=await env.DB.prepare(
  'SELECT id,mime_type,size_bytes,position,published,fit,created_at,'+
  'optimized_key,optimized_size_bytes,optimized_width,optimized_height FROM book_pages '+
  (admin?'':'WHERE published=1 ')+
  'ORDER BY position ASC,created_at ASC,id ASC LIMIT ?'
 ).bind(MAX_PAGES).all();
 const rows=result.results||[];
 const grants=await issueBookGrants(env,rows,admin,'reader');
 const originals=admin?await issueBookGrants(env,rows,true,'original'):[];
 return reply({section:'BOOK HAVANA NICE',pages:rows.map((row,i)=>({
  id:row.id,url:grants[i],fit:row.fit,position:row.position,
  published:!!row.published,
  ...(admin?{
   originalUrl:originals[i],sizeBytes:row.size_bytes,
   optimizedSizeBytes:row.optimized_key?row.optimized_size_bytes:0,
   optimizedWidth:row.optimized_width,optimizedHeight:row.optimized_height
  }:{})
 }))},200,origin);
}
async function readBookGrant(request,env,url,origin){
 if(request.method!=='GET'&&request.method!=='HEAD')return reply({error:'Método no permitido'},405,origin);
 const token=url.pathname.slice(MEDIA_ROUTE.length);
 if(!TOKEN.test(token))return reply({error:'Imagen no encontrada'},404,origin);
 const row=await env.DB.prepare(
  'SELECT p.object_key,p.mime_type,p.optimized_key,g.variant FROM book_media_grants g '+
  'JOIN book_pages p ON p.id=g.page_id '+
  'WHERE g.token_hash=? AND g.expires_at>? AND (p.published=1 OR g.admin_only=1)'
 ).bind(await sha256Hex(token),Date.now()).first();
 if(!row)return reply({error:'Enlace caducado o imagen no autorizada'},404,origin);
 if(!env.MEDIA_BUCKET)return reply({error:'Almacenamiento no disponible'},503,origin);
 const optimized=row.variant==='optimized'&&!!row.optimized_key;
 let object=await env.MEDIA_BUCKET.get(optimized?row.optimized_key:row.object_key);
 let mime=optimized?'image/webp':row.mime_type;
 // An interrupted or externally removed derivative must never hide the master.
 if(!object&&optimized){
  object=await env.MEDIA_BUCKET.get(row.object_key);
  mime=row.mime_type;
 }
 if(!object)return reply({error:'Imagen no encontrada'},404,origin);
 const headers=new Headers(mediaHeader(origin));headers.set('content-type',mime);
 headers.set('content-length',String(object.size));
 return new Response(request.method==='HEAD'?null:object.body,{status:200,headers});
}
async function uploadBookPage(request,env,origin){
 if(!env.MEDIA_BUCKET)return reply({error:'Almacenamiento no disponible'},503,origin);
 const mime=(request.headers.get('content-type')||'').split(';')[0].toLowerCase().trim();
 if(!MIMES.has(mime))return reply({error:'Solo fotos JPG, PNG, WebP, HEIC o HEIF'},415,origin);
 const size=Number(request.headers.get('content-length'));
 if(!Number.isSafeInteger(size)||size<=0)return reply({error:'Falta tamaño del archivo'},411,origin);
 if(size>MAX_BYTES)return reply({error:'Imagen demasiado grande (máximo 15 MB)'},413,origin);
 if(!request.body)return reply({error:'Imagen vacía'},400,origin);
 const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM book_pages').first();
 if(Number(count?.total||0)>=MAX_PAGES)return reply({error:'Límite de 80 páginas alcanzado'},409,origin);
 const id=crypto.randomUUID(),key='book/v2/'+id;
 const reservation=await reserveFamilyStorage(env,size,id);
 if(!reservation)return reply({error:'Espacio R2 insuficiente (protección 9.5 GB)'},409,origin);
 try{
  const object=await env.MEDIA_BUCKET.put(key,request.body,{
   httpMetadata:{contentType:mime},customMetadata:{module:'book-havana-nice-v2'}
  });
  if(!object||object.size!==size){
   await env.MEDIA_BUCKET.delete(key).catch(()=>{});
   return reply({error:'La imagen recibida no coincide con su tamaño'},400,origin);
  }
  try{
   await env.DB.prepare(
    'INSERT INTO book_pages(id,object_key,mime_type,size_bytes,position,published,fit,created_at) '+
    'VALUES(?,?,?,?,(SELECT COALESCE(MAX(position),0)+100 FROM book_pages),1,?,?)'
   ).bind(id,key,mime,size,'cover',new Date().toISOString()).run();
  }catch(err){
   // Even a failed D1 commit cannot leave the file silently orphaned in R2.
   try{await env.MEDIA_BUCKET.delete(key);}catch{
    await env.DB.prepare('INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)')
     .bind(key,size,new Date().toISOString()).run();
   }
   throw err;
  }
  return reply({ok:true,id,published:true},201,origin);
 }catch{return reply({error:'No se pudo guardar la página privada'},503,origin);}
 finally{await releaseFamilyStorage(env,reservation);}
}
// The Admin's browser encodes the WebP once. The Worker never transcodes a
// large photograph or invokes a paid image transformation product.
async function uploadOptimizedBookPage(request,env,id,origin){
 if(!env.MEDIA_BUCKET)return reply({error:'Almacenamiento no disponible'},503,origin);
 const page=await env.DB.prepare(
  'SELECT object_key,size_bytes,optimized_key,optimized_size_bytes FROM book_pages WHERE id=?'
 ).bind(id).first();
 if(!page)return reply({error:'Página no encontrada'},404,origin);
 const mime=(request.headers.get('content-type')||'').split(';')[0].toLowerCase();
 const size=Number(request.headers.get('content-length'));
 const width=Number(request.headers.get('x-book-width'));
 const height=Number(request.headers.get('x-book-height'));
 if(mime!=='image/webp')return reply({error:'BOOK optimizado requiere WebP'},415,origin);
 if(!Number.isSafeInteger(size)||size<100||size>MAX_OPTIMIZED_BYTES)
  return reply({error:'Derivado WebP vacío o excesivo'},413,origin);
 if(!Number.isInteger(width)||!Number.isInteger(height)||
    width<1||height<1||Math.max(width,height)>2200)
  return reply({error:'Dimensiones BOOK inválidas'},400,origin);
 if(size>=Number(page.size_bytes)*0.94)
  return reply({error:'La versión optimizada debe ser menor al original'},409,origin);
 const payload=new Uint8Array(await request.arrayBuffer());
 if(payload.length!==size||String.fromCharCode(...payload.subarray(0,4))!=='RIFF'||
    String.fromCharCode(...payload.subarray(8,12))!=='WEBP')
  return reply({error:'Archivo WebP inválido'},415,origin);
 const key='book/v2/optimized/'+id+'/'+crypto.randomUUID()+'.webp';
 const reservation=await reserveFamilyStorage(env,size,crypto.randomUUID());
 if(!reservation)return reply({error:'Protección R2: espacio insuficiente'},409,origin);
 let persisted=false;
 try{
  const stored=await env.MEDIA_BUCKET.put(key,payload,{
   httpMetadata:{contentType:'image/webp'},
   customMetadata:{module:'book-havana-nice-v2',variant:'optimized'}
  });
  if(!stored||stored.size!==size)throw Error('Optimized R2 length mismatch');
  const old=page.optimized_key;
  const mutation=env.DB.prepare(
   'UPDATE book_pages SET optimized_key=?,optimized_size_bytes=?,'+
   'optimized_width=?,optimized_height=? WHERE id=? AND object_key=? AND optimized_key IS ?'
  ).bind(key,size,width,height,id,page.object_key,old);
  const statements=[];
  if(old)statements.push(env.DB.prepare(
   'INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)'
  ).bind(old,page.optimized_size_bytes,new Date().toISOString()));
  statements.push(mutation);
  const changed=await env.DB.batch(statements);
  if(!Number(changed.at(-1)?.meta?.changes||0))
   throw Error('BOOK page changed during optimization');
  persisted=true;
  if(old)await cleanupBookQueue(env);
  return reply({ok:true,optimizedSizeBytes:size,width,height},200,origin);
 }catch{
  if(!persisted){
   try{await env.MEDIA_BUCKET.delete(key);}
   catch{
    await env.DB.prepare(
     'INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)'
    ).bind(key,size,new Date().toISOString()).run().catch(()=>{});
   }
  }
  return reply({error:'No se pudo guardar el derivado; el original permanece intacto'},503,origin);
 }finally{await releaseFamilyStorage(env,reservation);}
}
async function editBookPage(request,env,id,origin){
 let payload;try{payload=await request.json();}catch{return reply({error:'Datos inválidos'},400,origin);}
 const fields=[],values=[];
 if(Object.hasOwn(payload||{},'published')){
  if(typeof payload.published!=='boolean')return reply({error:'Publicación inválida'},400,origin);
  fields.push('published=?');values.push(payload.published?1:0);
 }
 if(Object.hasOwn(payload||{},'fit')){
  if(!['cover','contain'].includes(payload.fit))return reply({error:'Ajuste inválido'},400,origin);
  fields.push('fit=?');values.push(payload.fit);
 }
 if(Object.hasOwn(payload||{},'position')){
  if(!Number.isInteger(payload.position)||payload.position<0||payload.position>1_000_000)
   return reply({error:'Orden inválido'},400,origin);
  fields.push('position=?');values.push(payload.position);
 }
 if(!fields.length)return reply({error:'Sin cambios'},400,origin);
 const result=await env.DB.prepare('UPDATE book_pages SET '+fields.join(',')+' WHERE id=?')
  .bind(...values,id).run();
 return Number(result.meta?.changes||0)>0?reply({ok:true},200,origin):
  reply({error:'Página no encontrada'},404,origin);
}
async function deleteBookPage(env,id,origin){
 const page=await env.DB.prepare('SELECT object_key,size_bytes,optimized_key,optimized_size_bytes FROM book_pages WHERE id=?')
  .bind(id).first();
 if(!page)return reply({error:'Página no encontrada'},404,origin);
 const tasks=[env.DB.prepare(
  'INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)'
 ).bind(page.object_key,page.size_bytes,new Date().toISOString())];
 if(page.optimized_key)tasks.push(env.DB.prepare(
  'INSERT OR IGNORE INTO book_delete_queue(object_key,size_bytes,queued_at) VALUES(?,?,?)'
 ).bind(page.optimized_key,page.optimized_size_bytes,new Date().toISOString()));
 tasks.push(env.DB.prepare('DELETE FROM book_pages WHERE id=?').bind(id));
 await env.DB.batch(tasks);
 await cleanupBookQueue(env);
 return reply({ok:true},200,origin);
}
export async function handleBookApi(request,env,url,origin,verifyMember,ctx){
 if(url.pathname.startsWith(MEDIA_ROUTE)){
  try{return await readBookGrant(request,env,url,origin);}
  catch{return reply({error:'Imagen no disponible'},503,origin);}
 }
 const admin=url.pathname.startsWith('/api/book/admin/');
 const bearer=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(admin){
  if(!await verifyAdminSession(request,env))return reply({error:'No autorizado'},401,origin);
 }else if(!await verifyMember(env,bearer))return reply({error:'No autorizado'},401,origin);
 try{
  if(url.pathname===(admin?'/api/book/admin/pages':'/api/book/pages')&&request.method==='GET')
   return await listBook(env,admin,origin);
  if(!admin)return reply({error:'Método no permitido'},405,origin);
  const signal=async result=>{
   if(result.ok){
    const task=notifyFamilyClients(env);
    if(ctx?.waitUntil)ctx.waitUntil(task);else void task;
   }
   return result;
  };
  if(url.pathname==='/api/book/admin/pages'&&request.method==='POST')
   return signal(await uploadBookPage(request,env,origin));
  const m=/^\/api\/book\/admin\/pages\/([0-9a-f-]{36})$/.exec(url.pathname);
  if(m&&ID.test(m[1])){
   if(request.method==='PUT')return signal(await editBookPage(request,env,m[1],origin));
   if(request.method==='DELETE')return signal(await deleteBookPage(env,m[1],origin));
  }
  const optimized=/^\/api\/book\/admin\/pages\/([0-9a-f-]{36})\/optimized$/.exec(url.pathname);
  if(optimized&&ID.test(optimized[1])&&request.method==='POST')
   return signal(await uploadOptimizedBookPage(request,env,optimized[1],origin));
  return reply({error:'Ruta no encontrada'},404,origin);
 }catch{
  return reply({error:'BOOK HAVANA NICE temporalmente no disponible'},503,origin);
 }
}
