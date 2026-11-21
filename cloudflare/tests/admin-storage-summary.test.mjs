import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {issueAdminSession} from '../src/modules/admin/admin-auth.js';
import {handleAdminStorageSummary} from '../src/modules/admin/admin-storage-summary.js';

function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,created_at INTEGER,expires_at INTEGER,revoked_at INTEGER);
 CREATE TABLE family_media(size_bytes INTEGER,poster_key TEXT,poster_size_bytes INTEGER);
 CREATE TABLE chat_media_objects(size_bytes INTEGER,status TEXT);
 CREATE TABLE book_pages(size_bytes INTEGER,optimized_size_bytes INTEGER);
 CREATE TABLE calendar_event_photos(size_bytes INTEGER,optimized_size_bytes INTEGER);
 CREATE TABLE member_profiles(photo_key TEXT,photo_size INTEGER);
 CREATE TABLE member_stories(byte_size INTEGER);
 CREATE TABLE audio_tracks(size_bytes INTEGER,cover_size_bytes INTEGER);
 CREATE TABLE r2_member_delete_queue(size_bytes INTEGER);
 CREATE TABLE book_delete_queue(size_bytes INTEGER);
 CREATE TABLE audio_delete_queue(size_bytes INTEGER);
 CREATE TABLE calendar_photo_delete_queue(size_bytes INTEGER);
 CREATE TABLE family_upload_sessions(size_bytes INTEGER);
 CREATE TABLE family_upload_reservations(size_bytes INTEGER);
 INSERT INTO family_media VALUES(500,NULL,0);
 INSERT INTO chat_media_objects VALUES(1000,'ready');
 INSERT INTO chat_media_objects VALUES(999,'uploading');
 INSERT INTO book_pages VALUES(100,50);
 INSERT INTO calendar_event_photos VALUES(200,50);
 INSERT INTO member_profiles VALUES('private-key',70);
 INSERT INTO member_stories VALUES(80);
 INSERT INTO audio_tracks VALUES(120,30);
 INSERT INTO book_delete_queue VALUES(40);
 INSERT INTO family_upload_sessions VALUES(60);
 INSERT INTO family_upload_reservations VALUES(90);
 `);
 const DB={prepare:sql=>({bind:(...params)=>({
  first:async()=>db.prepare(sql).get(...params)||null,
  run:async()=>({meta:{changes:db.prepare(sql).run(...params).changes}}),
 }) ,first:async()=>db.prepare(sql).get()||null})};
 const env={DB,V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'test-only-private-secret'};
 const get=async(token='')=>{
  const url='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev/api/chat/admin/storage/summary';
  const req=new Request(url,{headers:token?{Authorization:'Bearer '+token}:{}});
  return handleAdminStorageSummary(req,env,new URL(url),'',
   (body,status)=>new Response(JSON.stringify(body),{status}));
 };
 return {env,get};
}
test('Storage summary rejects unauthenticated requests and never returns private object keys',async()=>{
 const {env,get}=fixture();
 assert.equal((await get()).status,401);
 const session=await issueAdminSession(env);
 const response=await get(session.token);
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.storage.usedBytes,2090);
 assert.equal(data.storage.pendingBytes,150);
 assert.equal(data.outsideQuotaBytes,150);
 assert.equal(data.indexedFiles,7);
 assert.deepEqual(data.rows.map(x=>x.id),[
  'family','chat','book','calendar','audio','stories','profiles','cleanup'
 ]);
 assert.equal(data.rows.find(x=>x.id==='chat').bytes,1000);
 assert.equal(data.rows.find(x=>x.id==='cleanup').bytes,40);
 assert.ok(!JSON.stringify(data).includes('private-key'));
 assert.ok(!JSON.stringify(data).includes('token_hash'));
});
