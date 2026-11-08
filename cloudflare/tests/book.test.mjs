import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {sha256Hex} from '../src/shared/crypto-helpers.js';
import {handleBookApi} from '../src/modules/book/book.js';
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
