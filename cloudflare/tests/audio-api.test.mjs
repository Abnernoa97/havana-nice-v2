import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {issueAdminSession} from '../src/modules/admin/admin-auth.js';
import {handleAudioApi,cleanupExpiredAudioGrants} from '../src/modules/audio/audio.js';
import {sha256Hex} from '../src/shared/crypto-helpers.js';
import {familyStorageUsage} from '../src/modules/family/family-quota.js';

const HOST='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec("PRAGMA foreign_keys=ON; CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER);");
 db.exec('CREATE TABLE chat_messages(seq INTEGER PRIMARY KEY);');
 db.exec('CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,created_at INTEGER,expires_at INTEGER,revoked_at INTEGER,last_seen_at INTEGER)');
 const migr=name=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
 for(const n of ['0021_family_media.sql','0022_family_upload_sessions.sql',
 '0023_family_video_posters.sql','0024_family_storage_budget.sql',
 '0025_chat_media_r2.sql','0026_member_delete_media_cleanup.sql',
 '0027_book_havana_nice.sql','0028_book_optimized_images.sql',
 '0018_calendar_events.sql','0019_calendar_free_text.sql','0029_calendar_event_memories.sql','0036_audio_library.sql'])
  db.exec(migr(n));
 const prepare=sql=>{
  const run=(params=[])=>({
   first:async()=>db.prepare(sql).get(...params)||null,
   all:async()=>({results:db.prepare(sql).all(...params)}),
   run:async()=>({meta:{changes:db.prepare(sql).run(...params).changes}})
  });
  return {...run(),bind:(...params)=>run(params)};
 };
 const DB={prepare,async batch(statements){
  const result=[];db.exec('BEGIN IMMEDIATE');
  try{for(const stmt of statements)result.push(await stmt.run());db.exec('COMMIT');return result;}
  catch(error){db.exec('ROLLBACK');throw error;}
 }};
 const stored=new Map();
 const MEDIA_BUCKET={
  async put(key,body){const bytes=new Uint8Array(await new Response(body).arrayBuffer());
   stored.set(key,bytes);return {size:bytes.length};},
  async get(key,opts){
   const bytes=stored.get(key);if(!bytes)return null;
   if(opts?.range?.get('range')){
    const m=/^bytes=(\d+)-(\d+)?$/.exec(opts.range.get('range'));
    if(m){const start=Number(m[1]),end=m[2]?Number(m[2]):bytes.length-1;
     const part=bytes.subarray(start,Math.min(end+1,bytes.length));
     return {size:bytes.length,range:{offset:start,length:part.length},body:new Blob([part]).stream()};}
   }
   return {size:bytes.length,body:new Blob([bytes]).stream()};
  },
  async delete(key){stored.delete(key);}
 };
 const env={DB,MEDIA_BUCKET,V2_ADMIN_LOGIN_MODE:'enabled',
  V2_ADMIN_LOGIN_SECRET:'test-admin-secret-not-production'};
 const req=async(path,method='GET',token='',body=null,extra={})=>{
  const url=new URL(HOST+path);
  const headers={...(token?{Authorization:'Bearer '+token}:{}),...extra};
  const request=new Request(url,{method,headers,...(body?{body}: {})});
  return handleAudioApi(request,env,url,'https://havana-nice-v2.pages.dev',
   async(_env,bearer)=>bearer==='noa'?{actorId:'noa'}:null,null);
 };
 return {db,env,stored,req};
}
test('Audio catalog is private; admin upload, artwork and streaming use expiring grants',async()=>{
 const {env,db,req}=setup();
 const first=await req('/api/audio/tracks');
 assert.equal(first.status,401);
 assert.equal((await req('/api/audio/admin/tracks')).status,401);
 const admin=await issueAdminSession(env);
 const mp3=Uint8Array.from({length:256},(_,i)=>i%251);
 const upload=await req('/api/audio/admin/tracks','POST',admin.token,mp3,{
  'Content-Type':'audio/mpeg','Content-Length':String(mp3.byteLength),
  'X-Audio-Title':encodeURIComponent('Canción de prueba'),'X-Audio-Artist':'HAVANA%20NICE'
 });
 assert.equal(upload.status,201);
 const id=(await upload.json()).id;
 assert.ok(id);
 assert.equal((await familyStorageUsage(env)).usedBytes,256);
 const file=(await (await req('/api/audio/tracks','GET','noa')).json()).tracks[0];
 assert.equal(file.title,'Canción de prueba');
 assert.equal(file.artist,'HAVANA NICE');
 assert.ok(file.audioUrl.startsWith('/api/audio/media/'));
 assert.equal(file.coverUrl,null);
 assert.equal((await req(file.audioUrl,'GET','',null,{Range:'bytes=0-49'})).status,206);
 const jpg=new Uint8Array(120);jpg.set([255,216,255]);
 const cover=await req('/api/audio/admin/tracks/'+id+'/cover','POST',admin.token,jpg,{
  'Content-Type':'image/jpeg','Content-Length':'120'
 });
 assert.equal(cover.status,200);
 const refreshed=(await (await req('/api/audio/tracks','GET','noa')).json()).tracks[0];
 assert.ok(refreshed.coverUrl);
 assert.equal((await req(refreshed.coverUrl)).status,200);
 assert.equal((await familyStorageUsage(env)).usedBytes,376);
 assert.equal((await req('/api/audio/admin/tracks/'+id,'DELETE','noa')).status,401);
 assert.equal((await req('/api/audio/admin/tracks/'+id,'DELETE',admin.token)).status,200);
 assert.equal((await (await req('/api/audio/tracks','GET','noa')).json()).tracks.length,0);
 assert.equal((await req(file.audioUrl)).status,404);
 assert.equal((await familyStorageUsage(env)).usedBytes,0);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audio_delete_queue').get().n,0);
});

test('Audio catalog never performs grant housekeeping; expired links stay private until cron cleanup',async()=>{
 const {db,env}=setup();
 const id='d1808ba2-c85b-4559-88b3-2ef3c2bdf129';
 db.prepare('INSERT INTO audio_tracks(id,title,artist,album,object_key,mime_type,size_bytes,created_at,position,published) VALUES(?,?,?,?,?,?,?,?,?,1)')
  .run(id,'Demo','HAVANA NICE','Audio','audio/test','audio/mpeg',1024,Date.now(),100);
 const token='abcdefabcdefabcdefabcdefabcdefab';
 db.prepare('INSERT INTO audio_media_grants(token_hash,track_id,variant,expires_at) VALUES(?,?,?,?)')
  .run(await sha256Hex(token),id,'audio',Date.now()-60000);
 const requestUrl=new URL(HOST+'/api/audio/tracks');
 const deniedUrl=new URL(HOST+'/api/audio/media/'+token);
 const verify=async()=>({actorId:'noa'});
 const expired=()=>db.prepare('SELECT COUNT(*) AS total FROM audio_media_grants WHERE expires_at<?')
  .get(Date.now()).total;
 assert.equal((await handleAudioApi(new Request(deniedUrl),env,deniedUrl,
  'https://havana-nice-v2.pages.dev',verify,null)).status,404);
 const scheduled=[];
 const ctx={waitUntil(task){scheduled.push(task);}};
 const result=await handleAudioApi(new Request(requestUrl,{headers:{Authorization:'Bearer noa'}}),
  env,requestUrl,'https://havana-nice-v2.pages.dev',verify,ctx);
 assert.equal(result.status,200);
 assert.equal((await result.json()).tracks.length,1);
 assert.equal(scheduled.length,0,'Opening Audio must not schedule grant housekeeping');
 assert.equal(expired(),1,'The catalog must leave expired rows for cron maintenance');
 await cleanupExpiredAudioGrants(env,2000);
 assert.equal(expired(),0,'Scheduled cleanup should reclaim expired grants');
 assert.equal((await handleAudioApi(new Request(deniedUrl),env,deniedUrl,
  'https://havana-nice-v2.pages.dev',verify,null)).status,404);
});

test('Audio grants use bounded multi-row inserts and keep 100 albums private',async()=>{
 const {db,env,req,stored}=setup();
 for(let i=0;i<100;i++){
  const id='00000000-0000-4000-8000-'+String(i).padStart(12,'0');
  db.prepare(
   'INSERT INTO audio_tracks(id,title,artist,album,object_key,mime_type,size_bytes,cover_key,cover_mime,cover_size_bytes,created_at,position,published) '+
   'VALUES(?,?,?,?,?,?,?,?,?,?,?,?,1)'
  ).run(id,'Demo '+i,'HAVANA NICE','Audio','audio/demo/'+i,
   'audio/mpeg',1024,'audio/cover/'+i,'image/jpeg',120,Date.now(),i);
 }
 stored.set('audio/demo/0',new Uint8Array(1024));
 const jpg=new Uint8Array(120);jpg.set([255,216,255]);
 stored.set('audio/cover/0',jpg);
 const originalBatch=env.DB.batch.bind(env.DB);
 const sizes=[];
 env.DB.batch=async statements=>{
  sizes.push(statements.length);
  return originalBatch(statements);
 };
 const response=await req('/api/audio/tracks','GET','noa');
 assert.equal(response.status,200);
 const tracks=(await response.json()).tracks;
 assert.equal(tracks.length,100);
 assert.deepEqual(sizes,[8],'200 grants must fit in eight 25-row INSERT statements');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audio_media_grants').get().n,200);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audio_media_grants WHERE variant='cover'").get().n,100);
 const urls=tracks.flatMap(track=>[track.audioUrl,track.coverUrl]);
 assert.equal(new Set(urls).size,200,'Each capability must be unique');
 assert.ok(urls.every(url=>/^\/api\/audio\/media\/[0-9a-f]{32}$/.test(url)));
 const audioHash=await sha256Hex(tracks[0].audioUrl.split('/').at(-1));
 const coverHash=await sha256Hex(tracks[0].coverUrl.split('/').at(-1));
 assert.equal(db.prepare('SELECT variant FROM audio_media_grants WHERE token_hash=?').get(audioHash).variant,'audio');
 assert.equal(db.prepare('SELECT variant FROM audio_media_grants WHERE token_hash=?').get(coverHash).variant,'cover');
 assert.equal((await req(tracks[0].audioUrl,'GET','',null,{Range:'bytes=0-49'})).status,206);
 assert.equal((await req(tracks[0].coverUrl)).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audio_media_grants WHERE expires_at>?').get(Date.now()).n,200);
});
