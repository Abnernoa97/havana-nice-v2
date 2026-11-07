import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {
 FAMILY_STORAGE_STOP_BYTES,FAMILY_STORAGE_WARNING_BYTES,familyStorageUsage,
 reserveFamilyStorage,releaseFamilyStorage
} from '../src/modules/family/family-quota.js';

const ACTOR='member:123e4567-e89b-42d3-a456-426614174001';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec("PRAGMA foreign_keys=ON; CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER);");
 db.prepare('INSERT INTO chat_members VALUES(?,?,?)').run(ACTOR,'Noa',1);
 const migration=name=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
 for(const file of ['0021_family_media.sql','0022_family_upload_sessions.sql','0023_family_video_posters.sql'])
  db.exec(migration(file));
 const id=crypto.randomUUID();
 db.prepare("INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at,poster_key,poster_mime) VALUES(?,?,?,?,?,?,0,0,?,?,?)")
  .run(id,ACTOR,'video','family/'+id,'video/mp4',100,'2026-11-01',null,null);
 db.prepare('INSERT INTO family_media_grants(token_hash,media_id,expires_at,variant) VALUES(?,?,?,?)')
  .run('saved-capability',id,9999999999999,'original');
 const draft=crypto.randomUUID();
 db.prepare('INSERT INTO family_upload_sessions VALUES(?,?,?,?,?,?,?)')
  .run(draft,ACTOR,'family/draft','resume-id','video/mp4',4*1024*1024,9999999999999);
 db.prepare('INSERT INTO family_upload_parts VALUES(?,?,?,?)')
  .run(draft,1,'resume-etag',123);
 db.exec(migration('0024_family_storage_budget.sql'));
 db.exec('CREATE TABLE chat_messages(seq INTEGER PRIMARY KEY)');
 db.exec(migration('0025_chat_media_r2.sql'));
 const DB={prepare(sql){return {bind(...args){return {
   async first(){return db.prepare(sql).get(...args)||null;},
   async all(){return {results:db.prepare(sql).all(...args)};},
   async run(){return db.prepare(sql).run(...args);}
  };},async first(){return db.prepare(sql).get()||null;}};}};
 return {raw:db,DB,env:{DB}};
}
test('migration removes 80 MiB CHECK but preserves originals, grants, and in-progress parts',()=>{
 const {raw}=setup();
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media').get().n,1);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media_grants').get().n,1);
 assert.equal(raw.prepare('SELECT etag FROM family_upload_parts').get().etag,'resume-etag');
 assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(),[]);
 raw.prepare('INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?,?,?,?,0,0,?)')
  .run(crypto.randomUUID(),ACTOR,'video','family/large','video/mp4',900*1024*1024,'2026-11-01');
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media').get().n,2);
 raw.close();
});
test('global budget counts originals, posters, multipart and atomic direct upload reservations',async()=>{
 const {raw,env}=setup();
 const initial=await familyStorageUsage(env);
 assert.equal(initial.usedBytes,100);
 assert.equal(initial.pendingBytes,4*1024*1024);
 assert.equal(initial.maxBytes,FAMILY_STORAGE_STOP_BYTES);
 const used=FAMILY_STORAGE_WARNING_BYTES+1;
 raw.prepare('UPDATE family_media SET size_bytes=? WHERE size_bytes=100').run(used);
 const warn=await familyStorageUsage(env);
 assert.equal(warn.warning,true);
 assert.equal(warn.stopped,false);
 const room=FAMILY_STORAGE_STOP_BYTES-used-4*1024*1024;
 assert.equal(await reserveFamilyStorage(env,room+1),null);
 const reserved=await reserveFamilyStorage(env,room);
 assert.ok(reserved);
 assert.equal((await familyStorageUsage(env)).stopped,true);
 assert.equal(await reserveFamilyStorage(env,1),null);
 await releaseFamilyStorage(env,reserved);
 assert.equal((await familyStorageUsage(env)).stopped,false);
 raw.close();
});
test('unknown old posters are conservatively reserved until an exact byte size is stored',async()=>{
 const {raw,env}=setup();
 raw.prepare("UPDATE family_media SET poster_key='family/preview',poster_mime='image/webp'").run();
 assert.equal((await familyStorageUsage(env)).usedBytes,100+384*1024);
 raw.prepare('UPDATE family_media SET poster_size_bytes=12500').run();
 assert.equal((await familyStorageUsage(env)).usedBytes,12600);
 raw.close();
});
