import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {
 familyAlbumSummaries,familyAlbumRoute,issueFamilyGrants,
 listFamilyMedia,readFamilyGrant,uploadFamilyMedia,checkFamilyOriginalUpload,uploadFamilyPoster,pruneExpiredFamilyGrants,deleteFamilyMedia,selectFamilyCover,familyMediaItemRoute
} from '../src/family-media.js';
import {FAMILY_STORAGE_STOP_BYTES} from '../src/family-quota.js';

const ACTOR='member:123e4567-e89b-42d3-a456-426614174001';
const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
function setup(){
 const raw=new DatabaseSync(':memory:');
 raw.exec('PRAGMA foreign_keys=ON; CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER);');
 raw.prepare('INSERT INTO chat_members VALUES(?,?,?)').run(ACTOR,'Noa',1);
 raw.prepare('INSERT INTO chat_members VALUES(?,?,?)').run('member:inactive','Inactive',0);
 raw.exec(readFileSync(new URL('../migrations/0021_family_media.sql',import.meta.url),'utf8'));
 for(const migration of ['0022_family_upload_sessions.sql','0023_family_video_posters.sql','0024_family_storage_budget.sql'])
  raw.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
 raw.exec('CREATE TABLE chat_messages(seq INTEGER PRIMARY KEY)');
 raw.exec(readFileSync(new URL('../migrations/0025_chat_media_r2.sql',import.meta.url),'utf8'));
 const DB={async batch(stmts){return Promise.all(stmts.map(stmt=>stmt.run()))},prepare(sql){return {bind(...args){
   return {async all(){return {results:raw.prepare(sql).all(...args)}},
    async first(){return raw.prepare(sql).get(...args)||null},
    async run(){return raw.prepare(sql).run(...args)}};
  },async all(){return {results:raw.prepare(sql).all()}},
   async first(){return raw.prepare(sql).get()||null},async run(){return raw.prepare(sql).run()}};
 }};
 const objects=new Map();
 const MEDIA_BUCKET={
  async put(key,body,opts){const buf=new Uint8Array(await new Response(body).arrayBuffer());objects.set(key,{bytes:buf,opts});return {key,size:buf.length};},
  async get(key){const item=objects.get(key);if(!item)return null;return {body:new Blob([item.bytes]).stream(),size:item.bytes.byteLength,range:null};},
  async delete(key){for(const k of Array.isArray(key)?key:[key])objects.delete(k)}
 };
 return {raw,objects,DB,MEDIA_BUCKET,env:{DB,MEDIA_BUCKET}};
}
test('Familia R2: only admin-side validated metadata may persist and no public file URL',async()=>{
 const {env,raw,objects}=setup();
 const request=new Request(BASE+'/api/family/admin/albums/'+ACTOR+'/media',{
  method:'POST',
  headers:{'Content-Type':'image/jpeg','Content-Length':'4'},
  body:new Uint8Array([0xff,0xd8,0xff,0xd9])
 });
 const response=await uploadFamilyMedia(request,env,ACTOR,'');
 assert.equal(response.status,201);
 const saved=await response.json();
 assert.equal(saved.kind,'photo');
 assert.ok(saved.id);
 assert.equal(objects.size,1);
 assert.equal(raw.prepare('SELECT actor_id FROM family_media').get().actor_id,ACTOR);
 const sum=await familyAlbumSummaries(env,[{actor_id:ACTOR,display_name:'Noa'}]);
 assert.equal(sum[0].photoCount,1);
 assert.equal(sum[0].videoCount,0);
 assert.ok(/^\/api\/family\/media\/[a-f0-9]{32}$/.test(sum[0].coverUrl));
 const media=await listFamilyMedia(env,ACTOR);
 assert.equal(media.length,1);
 assert.equal(media[0].kind,'photo');
 assert.ok(media[0].fileUrl.startsWith('/api/family/media/'));
 const get=new Request(BASE+media[0].fileUrl);
 const result=await readFamilyGrant(get,env,new URL(get.url),'');
 assert.equal(result.status,200);
 assert.equal(result.headers.get('cache-control'),'private, no-store');
 assert.equal(result.headers.get('content-type'),'image/jpeg');
 assert.equal(result.headers.get('x-content-type-options'),'nosniff');
 assert.deepEqual(new Uint8Array(await result.arrayBuffer()),new Uint8Array([0xff,0xd8,0xff,0xd9]));
 assert.equal((await readFamilyGrant(new Request(BASE+'/api/family/media/forged'),env,
  new URL(BASE+'/api/family/media/forged'),'')).status,404);
 raw.close();
});
test('Familia R2: invalid formats, sizes and inactive members are blocked before writing',async()=>{
 const {env,objects,raw}=setup();
 const request=(mime,length,actor=ACTOR)=>new Request(BASE+'/api/family/admin/albums/'+actor+'/media',{
  method:'POST',headers:{'content-type':mime,'content-length':String(length)},
  body:new Uint8Array([0,1,2])
 });
 assert.equal((await uploadFamilyMedia(request('text/html',3),env,ACTOR,'')).status,415);
 assert.equal((await uploadFamilyMedia(request('video/mp4',FAMILY_STORAGE_STOP_BYTES+1),env,ACTOR,'')).status,413);
 assert.equal((await uploadFamilyMedia(request('image/png',3,'member:inactive'),env,'member:inactive','')).status,404);
 assert.equal(objects.size,0);
 assert.equal(raw.prepare('SELECT COUNT(*) count FROM family_media').get().count,0);
 raw.close();
});
test('small original upload is idempotent after client lost successful response',async()=>{
 const {env,raw,objects}=setup();
 const uploadId=crypto.randomUUID();
 const data=new Uint8Array([255,216,255,217]);
 const request=()=>new Request(BASE+'/api/family/admin/albums/'+ACTOR+'/media',{
  method:'POST',headers:{'Content-Type':'image/jpeg','Content-Length':String(data.length),
   'X-Havana-V2-Upload-ID':uploadId},body:data
 });
 const first=await uploadFamilyMedia(request(),env,ACTOR,'');
 assert.equal(first.status,201);
 assert.equal((await first.json()).id,uploadId);
 const acknowledge=await checkFamilyOriginalUpload(env,ACTOR,uploadId,'');
 assert.equal(acknowledge.status,200);
 assert.deepEqual(await acknowledge.json(),{id:uploadId,sizeBytes:4,mimeType:'image/jpeg'});
 const before=objects.size;
 const second=await uploadFamilyMedia(request(),env,ACTOR,'');
 assert.equal(second.status,200);
 assert.equal((await second.json()).alreadySaved,true);
 assert.equal(objects.size,before);
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM family_media').get().n,1);
 assert.equal((await checkFamilyOriginalUpload(env,'member:other',uploadId,'')).status,404);
 raw.close();
});
test('Familia R2: revoking canonical member removes access to old grants',async()=>{
 const {env,raw}=setup();
 const id=crypto.randomUUID();
 raw.prepare('INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?,?,?,?,0,0,?)')
  .run(id,ACTOR,'photo','family/'+ACTOR+'/'+id,'image/jpeg',4,new Date().toISOString());
 const [path]=await issueFamilyGrants(env,[{id,variant:'original'}]);
 raw.prepare('UPDATE chat_members SET active=0 WHERE actor_id=?').run(ACTOR);
 const req=new Request(BASE+path);
 assert.equal((await readFamilyGrant(req,env,new URL(req.url),'')).status,404);
 assert.equal(await listFamilyMedia(env,ACTOR),null);
 raw.close();
});
test('Familia R2: expired token rows are removed without deleting stored images',async()=>{
 const {env,raw,objects}=setup();
 const id=crypto.randomUUID();
 raw.prepare('INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?,?,?,?,0,0,?)')
  .run(id,ACTOR,'photo','family/'+ACTOR+'/'+id,'image/jpeg',4,new Date().toISOString());
 raw.prepare('INSERT INTO family_media_grants(token_hash,media_id,expires_at) VALUES(?,?,?)')
  .run('expired-grant',id,1);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media_grants').get().n,1);
 await pruneExpiredFamilyGrants(env);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media_grants').get().n,0);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media').get().n,1);
 assert.equal(objects.size,0);
 raw.close();
});
test('Familia R2: mismatch between transmitted and declared byte length fails closed',async()=>{
 const {env,raw,objects}=setup();
 const request=new Request(BASE+'/api/family/admin/albums/'+ACTOR+'/media',{
  method:'POST',headers:{'Content-Type':'image/jpeg','Content-Length':'3'},
  body:new Uint8Array([0xff,0xd8,0xff,0xd9])
 });
 const response=await uploadFamilyMedia(request,env,ACTOR,'');
 assert.equal(response.status,400);
 assert.equal(objects.size,0);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media').get().n,0);
 raw.close();
});
test('Familia R2: Administrator can select a cover and permanently delete only its own album file',async()=>{
 const {env,raw,objects}=setup();
 const ids=[crypto.randomUUID(),crypto.randomUUID()];
 for(const id of ids){
  const key='family/'+ACTOR+'/'+id;
  raw.prepare('INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?,?,?,?,0,0,?)')
   .run(id,ACTOR,'photo',key,'image/jpeg',4,new Date().toISOString());
  objects.set(key,{bytes:new Uint8Array([1,2,3,4])});
 }
 const cover=await selectFamilyCover(env,ACTOR,ids[1],'');
 assert.equal(cover.status,200);
 const rows=raw.prepare('SELECT id FROM family_media WHERE is_cover=1').all();
 assert.deepEqual(rows.map(x=>x.id),[ids[1]]);
 const [grant]=await issueFamilyGrants(env,[{id:ids[1],variant:'original'}]);
 assert.match(grant,/^\/api\/family\/media\//);
 const denied=await deleteFamilyMedia(env,'member:other',ids[1],'');
 assert.equal(denied.status,404);
 assert.equal(objects.size,2);
 const removed=await deleteFamilyMedia(env,ACTOR,ids[1],'');
 assert.equal(removed.status,200);
 assert.equal(objects.size,1);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media').get().n,1);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media_grants').get().n,0);
 raw.close();
});
test('Familia R2: video cannot be chosen as photo cover',async()=>{
 const {env,raw}=setup();
 const id=crypto.randomUUID();
 raw.prepare('INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?,?,?,?,0,0,?)')
  .run(id,ACTOR,'video','family/'+ACTOR+'/'+id,'video/mp4',4,new Date().toISOString());
 const r=await selectFamilyCover(env,ACTOR,id,'');
 assert.equal(r.status,404);
 assert.equal(raw.prepare('SELECT is_cover FROM family_media').get().is_cover,0);
 raw.close();
});
test('real private video poster is shown in album and served without exposing original grants',async()=>{
 const {env,raw,objects}=setup();
 const id=crypto.randomUUID(),key='family/'+ACTOR+'/'+id;
 raw.prepare("INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?,?,?,?,0,0,?)")
  .run(id,ACTOR,'video',key,'video/mp4',100,new Date().toISOString());
 objects.set(key,{bytes:new Uint8Array([1,2,3,4])});
 const poster=new Uint8Array(80);
 poster.set([82,73,70,70],0); // RIFF
 poster.set([87,69,66,80],8); // WEBP
 const request=new Request(BASE+'/api/family/admin/albums/'+ACTOR+'/media/'+id+'/poster',{
  method:'POST',headers:{'Content-Type':'image/webp','Content-Length':String(poster.length)},body:poster
 });
 const saved=await uploadFamilyPoster(request,env,ACTOR,id,'');
 assert.equal(saved.status,201);
 assert.equal(raw.prepare('SELECT poster_mime FROM family_media WHERE id=?').get(id).poster_mime,'image/webp');
 const albums=await familyAlbumSummaries(env,[{actor_id:ACTOR,display_name:'Noa'}]);
 assert.equal(albums[0].videoCount,1);
 assert.ok(albums[0].coverUrl?.startsWith('/api/family/media/'));
 const media=await listFamilyMedia(env,ACTOR);
 assert.equal(media.length,1);
 assert.ok(media[0].thumbnailUrl?.startsWith('/api/family/media/'));
 assert.notEqual(media[0].thumbnailUrl,media[0].fileUrl);
 const original=new Request(BASE+media[0].fileUrl);
 const originalResp=await readFamilyGrant(original,env,new URL(original.url),'');
 assert.equal(originalResp.headers.get('content-type'),'video/mp4');
 const thumb=new Request(BASE+media[0].thumbnailUrl);
 const thumbResp=await readFamilyGrant(thumb,env,new URL(thumb.url),'');
 assert.equal(thumbResp.headers.get('content-type'),'image/webp');
 assert.deepEqual(new Uint8Array(await thumbResp.arrayBuffer()),poster);
 raw.prepare('UPDATE chat_members SET active=0 WHERE actor_id=?').run(ACTOR);
 assert.equal((await readFamilyGrant(thumb,env,new URL(thumb.url),'')).status,404);
 raw.close();
});
test('poster rejects other albums, photo originals, invalid signatures and oversized payloads',async()=>{
 const {env,raw,objects}=setup();
 const id=crypto.randomUUID();
 raw.prepare("INSERT INTO family_media(id,actor_id,kind,object_key,mime_type,size_bytes,position,is_cover,created_at) VALUES(?,?,?,?,?,?,0,0,?)")
  .run(id,ACTOR,'photo','family/'+ACTOR+'/'+id,'image/jpeg',80,new Date().toISOString());
 const body=new Uint8Array(80);
 const request=(mime,size,actor=ACTOR)=>new Request(BASE+'/api/family/admin/albums/'+actor+'/media/'+id+'/poster',{
  method:'POST',headers:{'content-type':mime,'content-length':String(size)},body
 });
 assert.equal((await uploadFamilyPoster(request('image/png',80),env,ACTOR,id,'')).status,415);
 assert.equal((await uploadFamilyPoster(request('image/webp',400*1024),env,ACTOR,id,'')).status,413);
 assert.equal((await uploadFamilyPoster(request('image/webp',80),env,ACTOR,id,'')).status,404);
 raw.prepare("UPDATE family_media SET kind='video',mime_type='video/mp4' WHERE id=?").run(id);
 assert.equal((await uploadFamilyPoster(request('image/webp',80),env,ACTOR,id,'')).status,415);
 assert.equal((await uploadFamilyPoster(request('image/webp',80,'member:other'),env,'member:other',id,'')).status,404);
 assert.equal(objects.size,0);
 raw.close();
});
test('Familia R2: specific album routes are explicit; no arbitrary nested keys',()=>{
 assert.deepEqual(familyAlbumRoute('/api/family/admin/albums/'+ACTOR+'/media'),{admin:true,actorId:ACTOR});
 assert.deepEqual(familyAlbumRoute('/api/family/albums/'+ACTOR+'/media'),{admin:false,actorId:ACTOR});
 assert.deepEqual(familyAlbumRoute('/api/family/albums/'+encodeURIComponent(ACTOR)+'/media'),{admin:false,actorId:ACTOR});
 assert.deepEqual(familyAlbumRoute('/api/family/admin/albums/'+encodeURIComponent(ACTOR)+'/media'),{admin:true,actorId:ACTOR});
 assert.equal(familyAlbumRoute('/api/family/albums/../../secrets/media'),null);
 assert.deepEqual(familyMediaItemRoute('/api/family/admin/albums/'+encodeURIComponent(ACTOR)+'/media/123e4567-e89b-42d3-a456-426614174001'),{actorId:ACTOR,id:'123e4567-e89b-42d3-a456-426614174001',cover:false,poster:false});
 assert.deepEqual(familyMediaItemRoute('/api/family/admin/albums/'+encodeURIComponent(ACTOR)+'/media/123e4567-e89b-42d3-a456-426614174001/cover'),{actorId:ACTOR,id:'123e4567-e89b-42d3-a456-426614174001',cover:true,poster:false});
 assert.equal(familyMediaItemRoute('/api/family/albums/'+ACTOR+'/media/123e4567-e89b-42d3-a456-426614174001'),null);
 assert.deepEqual(familyMediaItemRoute('/api/family/admin/albums/'+encodeURIComponent(ACTOR)+'/media/123e4567-e89b-42d3-a456-426614174001/poster'),{actorId:ACTOR,id:'123e4567-e89b-42d3-a456-426614174001',cover:false,poster:true});
});
