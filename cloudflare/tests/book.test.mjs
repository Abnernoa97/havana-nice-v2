import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sha256Hex} from '../src/shared/crypto-helpers.js';
import {handleBookApi} from '../src/modules/book/book.js';
import {familyStorageUsage} from '../src/modules/family/family-quota.js';
const ORIGIN='https://havana-nice-v2.pages.dev';
const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const ADMIN='a'.repeat(48);
const migrations=['0021_family_media.sql','0022_family_upload_sessions.sql',
 '0023_family_video_posters.sql','0024_family_storage_budget.sql',
 '0025_chat_media_r2.sql','0026_member_delete_media_cleanup.sql','0027_book_havana_nice.sql','0028_book_optimized_images.sql'];
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER)');
 db.exec('CREATE TABLE chat_messages(seq INTEGER PRIMARY KEY)');
 db.exec('CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER)');
 for(const name of migrations)db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const auth=sha256Hex(ADMIN);
 const DB={
  prepare(sql){
   const run=(args=[])=>({
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},
    async run(){return {meta:db.prepare(sql).run(...args)};}
   });
   return {...run(),bind(...args){return run(args)}};
  },
  async batch(statements){const result=[];for(const stmt of statements)result.push(await stmt.run());return result;}
 };
 const objects=new Map();
 let failDelete=false;
 const MEDIA_BUCKET={
  async put(key,body){
   const bytes=new Uint8Array(await new Response(body).arrayBuffer());
   objects.set(key,bytes);
   return {size:bytes.byteLength};
  },
  async get(key){const bytes=objects.get(key);return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;},
  async delete(key){if(failDelete)throw new Error('temporary R2 outage');objects.delete(key);}
 };
 const env={DB,MEDIA_BUCKET,V2_ADMIN_LOGIN_MODE:'enabled',
  V2_ADMIN_LOGIN_SECRET:'private-admin-password',
  CHAT_ROOMS:{idFromName:()=>1,get:()=>({fetch:async()=>new Response(null,{status:200})})}};
 const api=async(path,options={})=>{
  const headers={Authorization:'Bearer '+(options.token||'member-token'),...(options.headers||{})};
  const request=new Request(BASE+path,{method:options.method||'GET',headers,
   ...(options.body!==undefined?{body:options.body}:{})});
  return handleBookApi(request,env,new URL(request.url),ORIGIN,async(_env,token)=>token==='member-token'?{actorId:'member:test'}:null,
   {waitUntil(p){void p;}});
 };
 return {db,env,api,objects,authorize:async()=>{
  db.prepare('INSERT INTO chat_admin_sessions(token_hash,expires_at,revoked_at) VALUES(?,?,NULL)')
   .run(await auth,Date.now()+60000);
 },setDeleteFailure(x){failDelete=x;}};
}
test('BOOK D1 migration remains isolated from Familia and all foreign keys valid',()=>{
 const ctx=setup();
 assert.deepEqual(ctx.db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM book_pages').get().n,0);
 assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM family_media').get().n,0);
 ctx.db.close();
});
test('Only Admin can upload, reorder and publish; grants remain private',async()=>{
 const x=setup();await x.authorize();
 const img=new Uint8Array([255,216,255,217]);
 const headers={'content-type':'image/jpeg','content-length':String(img.length)};
 assert.equal((await x.api('/api/book/admin/pages',{method:'POST',body:img,headers})).status,401);
 const uploaded=await x.api('/api/book/admin/pages',{token:ADMIN,method:'POST',body:img,headers});
 assert.equal(uploaded.status,201);
 const {id}=await uploaded.json();
 assert.equal(x.objects.size,1);
 const published=await(await x.api('/api/book/pages')).json();
 assert.equal(published.pages.length,1);
 assert.ok(published.pages[0].url.startsWith('/api/book/media/'));
 const publicToken=published.pages[0].url;
 assert.equal((await x.api(publicToken)).status,200);
 const adminList=await(await x.api('/api/book/admin/pages',{token:ADMIN})).json();
 assert.equal(adminList.pages.length,1);
 const update=await x.api('/api/book/admin/pages/'+id,{method:'PUT',token:ADMIN,
  headers:{'content-type':'application/json'},body:JSON.stringify({published:false,fit:'contain',position:50})});
 assert.equal(update.status,200);
 assert.equal((await(await x.api('/api/book/pages')).json()).pages.length,0);
 assert.equal((await x.api(publicToken)).status,404,'unpublished pages must revoke member grants');
 const hidden=await(await x.api('/api/book/admin/pages',{token:ADMIN})).json();
 assert.equal(hidden.pages.length,1);
 assert.equal(hidden.pages[0].published,false);
 assert.equal(hidden.pages[0].fit,'contain');
 assert.equal((await x.api(hidden.pages[0].url)).status,200,'Admin can privately preview drafts');
 const deleted=await x.api('/api/book/admin/pages/'+id,{token:ADMIN,method:'DELETE'});
 assert.equal(deleted.status,200);
 assert.equal(x.objects.size,0);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM book_delete_queue').get().n,0);
 x.db.close();
});
test('private WebP derivatives never overwrite originals, and both count toward the global R2 limit',async()=>{
 const x=setup();await x.authorize();
 const jpg=new Uint8Array(1200);jpg.set([255,216,255,217]);
 const created=await x.api('/api/book/admin/pages',{token:ADMIN,method:'POST',body:jpg,
  headers:{'content-type':'image/jpeg','content-length':String(jpg.length)}});
 assert.equal(created.status,201);
 const {id}=await created.json();
 const original=x.db.prepare('SELECT object_key,size_bytes FROM book_pages WHERE id=?').get(id);
 assert.equal(original.size_bytes,1200);
 const oldMember=await(await x.api('/api/book/pages')).json();
 const originalGrant=oldMember.pages[0].url;
 const optimized=new Uint8Array(180);optimized.set(Buffer.from('RIFF'),0);
 optimized.set(Buffer.from('WEBP'),8);
 const address='/api/book/admin/pages/'+id+'/optimized';
 const headers={'content-type':'image/webp','content-length':String(optimized.length),
  'x-book-width':'1200','x-book-height':'800'};
 assert.equal((await x.api(address,{method:'POST',body:optimized,headers})).status,401);
 assert.equal((await x.api(address,{token:ADMIN,method:'POST',body:optimized,
  headers:{...headers,'x-book-width':'2800'}})).status,400);
 assert.equal((await x.api(address,{token:ADMIN,method:'POST',body:optimized,headers})).status,200);
 const row=x.db.prepare('SELECT * FROM book_pages WHERE id=?').get(id);
 assert.equal(row.object_key,original.object_key,'must never overwrite full-resolution master');
 assert.equal(row.optimized_size_bytes,180);
 assert.equal(row.optimized_width,1200);
 assert.equal(row.optimized_height,800);
 assert.equal(x.objects.size,2);
 assert.equal((await x.api(originalGrant)).headers.get('content-type'),'image/jpeg');
 const light=await(await x.api('/api/book/pages')).json();
 assert.equal(light.pages.length,1);
 assert.notEqual(light.pages[0].url,originalGrant);
 const response=await x.api(light.pages[0].url);
 assert.equal(response.headers.get('content-type'),'image/webp');
 assert.deepEqual(new Uint8Array(await response.arrayBuffer()),optimized);
 const admin=await(await x.api('/api/book/admin/pages',{token:ADMIN})).json();
 assert.equal(admin.pages[0].optimizedSizeBytes,180);
 assert.equal(admin.pages[0].sizeBytes,1200);
 assert.equal((await x.api(admin.pages[0].originalUrl)).headers.get('content-type'),'image/jpeg');
 const used=x.db.prepare('SELECT SUM(size_bytes+optimized_size_bytes) AS bytes FROM book_pages').get();
 assert.equal(used.bytes,1380);
 assert.equal((await familyStorageUsage(x.env)).usedBytes,1380);
 // If an optimized object vanishes independently, its grant falls back
 // to the preserved original rather than leaving a blank page.
 x.objects.delete(row.optimized_key);
 const fallback=await x.api(light.pages[0].url);
 assert.equal(fallback.headers.get('content-type'),'image/jpeg');
 assert.equal((await fallback.arrayBuffer()).byteLength,1200);
 const deleted=await x.api('/api/book/admin/pages/'+id,{token:ADMIN,method:'DELETE'});
 assert.equal(deleted.status,200);
 assert.equal(x.objects.size,0);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM book_delete_queue').get().n,0);
 assert.equal((await x.api(light.pages[0].url)).status,404);
 x.db.close();
});
test('optimizing twice replaces only the derivative and leaves no orphaned objects',async()=>{
 const x=setup();await x.authorize();
 const source=new Uint8Array(1600);source.set([255,216,255,217]);
 const uploaded=await x.api('/api/book/admin/pages',{token:ADMIN,method:'POST',body:source,
  headers:{'content-type':'image/jpeg','content-length':String(source.length)}});
 const {id}=await uploaded.json();
 const url='/api/book/admin/pages/'+id+'/optimized';
 const webp=new Uint8Array(200);webp.set(Buffer.from('RIFF'));webp.set(Buffer.from('WEBP'),8);
 for(let i=0;i<2;i++){
  const response=await x.api(url,{method:'POST',token:ADMIN,body:webp,headers:{
   'content-type':'image/webp','content-length':'200','x-book-width':'1500','x-book-height':'800'
  }});
  assert.equal(response.status,200);
  assert.equal(x.objects.size,2,'the previous optimized copy must be deleted');
  assert.equal(x.db.prepare('SELECT COUNT(*) n FROM book_delete_queue').get().n,0);
 }
 x.setDeleteFailure(true);
 assert.equal((await x.api('/api/book/admin/pages/'+id,{method:'DELETE',token:ADMIN})).status,200);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM book_delete_queue').get().n,2);
 assert.equal(x.objects.size,2);
 x.db.close();
});
test('BOOK R2 deletion failure keeps a durable queue and counts toward quota',async()=>{
 const x=setup();await x.authorize();
 const img=new Uint8Array([255,216,255,217]);
 const uploaded=await x.api('/api/book/admin/pages',{token:ADMIN,method:'POST',body:img,
  headers:{'content-type':'image/jpeg','content-length':'4'}});
 const {id}=await uploaded.json();
 x.setDeleteFailure(true);
 assert.equal((await x.api('/api/book/admin/pages/'+id,{token:ADMIN,method:'DELETE'})).status,200);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM book_pages').get().n,0);
 assert.equal(x.db.prepare('SELECT COUNT(*) n FROM book_delete_queue').get().n,1);
 assert.equal(x.objects.size,1);
 x.db.close();
});
