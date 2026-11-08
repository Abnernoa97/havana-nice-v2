import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {sha256Hex} from '../src/shared/crypto-helpers.js';
import {handleCalendarMemories} from '../src/modules/calendar/calendar-memories.js';
import {handleCalendarApi} from '../src/modules/calendar/calendar.js';
import {familyStorageUsage} from '../src/modules/family/family-quota.js';
const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const ADMIN='A'.repeat(48),M1='member:test-noa',M2='member:test-fer';
const migrations=[
 '0018_calendar_events.sql','0019_calendar_free_text.sql',
 '0021_family_media.sql','0022_family_upload_sessions.sql','0023_family_video_posters.sql',
 '0024_family_storage_budget.sql','0025_chat_media_r2.sql',
 '0026_member_delete_media_cleanup.sql','0027_book_havana_nice.sql',
 '0028_book_optimized_images.sql','0029_calendar_event_memories.sql'
];
async function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;');
 db.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER);');
 db.exec('CREATE TABLE chat_messages(seq INTEGER PRIMARY KEY);');
 db.exec('CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER);');
 for(const migration of migrations)db.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
 for(const [id,name] of [[M1,'Noa'],[M2,'Fer']]){
  db.prepare('INSERT INTO chat_members VALUES(?,?,1)').run(id,name);
 }
 db.prepare('INSERT INTO chat_admin_sessions VALUES(?,?,NULL)')
  .run(await sha256Hex(ADMIN),Date.now()+60000);
 const DB={
  prepare(sql){
   const bound=(args=[])=>({
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},
    async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}
   });
   return {...bound(),bind(...args){return bound(args)}};
  },
  async batch(statements){
   db.exec('BEGIN IMMEDIATE');
   try{
    const results=[];
    for(const stmt of statements)results.push(await stmt.run());
    db.exec('COMMIT');
    return results;
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
 };
 const objects=new Map();
 let failDelete=false;
 const MEDIA_BUCKET={
  async put(key,body){
   const bytes=new Uint8Array(await new Response(body).arrayBuffer());
   objects.set(key,bytes);
   return {size:bytes.length};
  },
  async get(key){
   const bytes=objects.get(key);
   return bytes?{size:bytes.length,body:new Blob([bytes]).stream()}:null;
  },
  async delete(key){
   if(failDelete)throw Error('Simulated R2 outage');
   objects.delete(key);
  }
 };
 const env={DB,MEDIA_BUCKET,V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'private-secret'};
 const verify=async(_env,token)=>token==='member'?{actorId:M1}:
  token==='other'?{actorId:M2}:null;
 async function call(path,{method='GET',admin=false,other=false,body,headers={}}={}){
  const request=new Request(BASE+path,{method,headers:{
   Authorization:'Bearer '+(admin?ADMIN:other?'other':'member'),...headers},
   ...(body!==undefined?{body}:{})});
  const response=path.includes('/photos')||path.includes('/api/calendar/photo/')?
   await handleCalendarMemories(request,env,new URL(request.url),verify):
   await handleCalendarApi(request,env,new URL(request.url),'',(data,status=200)=>Response.json(data,{status}),verify);
  return response;
 }
 const event={
  date:'2026-10-15',timeZone:'America/Mexico_City',title:'Boda real',
  venue:'Casa de la Bola',city:'Ciudad de México',callTime:'5',soundcheckTime:'',
  arrivalTime:'',showTime:'7',endTime:'',wardrobe:'',details:'',
  contactName:'',contactPhone:'',notes:'',mapUrl:'',status:'confirmed',statusText:'',
  recipientIds:[M1]
 };
 const created=await call('/api/calendar/admin/events',{method:'POST',admin:true,
  body:JSON.stringify(event),headers:{'content-type':'application/json'}});
 assert.equal(created.status,201,await created.clone().text().catch(()=>''));
 const eventId=(await created.clone().json()).event.id;
 return {db,env,objects,event,eventId,call,setFailDelete(x){failDelete=x;}};
}
function jpeg(n){
 const bytes=new Uint8Array(n);
 bytes.set([255,216,255,217]);
 return bytes;
}
function webp(n){
 const bytes=new Uint8Array(n);
 bytes.set(Buffer.from('RIFF'));
 bytes.set(Buffer.from('WEBP'),8);
 return bytes;
}
async function addPhoto(x,n=1200){
 const photo=jpeg(n);
 const request=await x.call('/api/calendar/admin/events/'+x.eventId+'/photos',{
  method:'POST',admin:true,body:photo,
  headers:{'content-type':'image/jpeg','content-length':String(n)}
 });
 assert.equal(request.status,201,await request.clone().text());
 return (await request.json()).id;
}
test('Event album is private, attached to the correct Calendar assignment, and uses BOOK WebP',async()=>{
 const x=await setup(),base='/api/calendar/events/'+x.eventId+'/photos';
 assert.equal((await x.call(base,{other:true})).status,403);
 assert.equal((await x.call('/api/calendar/admin/events/'+x.eventId+'/photos')).status,401);
 const id=await addPhoto(x);
 const pending=await (await x.call(base)).json();
 assert.equal(pending.photos.length,1);
 assert.equal((await x.call(pending.photos[0].url)).headers.get('content-type'),'image/jpeg');
 const bytes=webp(230);
 const optimized=await x.call('/api/calendar/admin/events/'+x.eventId+'/photos/'+id+'/optimized',{
  method:'POST',admin:true,body:bytes,headers:{
   'content-type':'image/webp','content-length':'230','x-book-width':'1500','x-book-height':'1100'
  }
 });
 assert.equal(optimized.status,200,await optimized.clone().text());
 const list=await(await x.call(base)).json();
 assert.equal(list.photos.length,1);
 const light=await x.call(list.photos[0].url);
 assert.equal(light.headers.get('content-type'),'image/webp');
 assert.deepEqual(new Uint8Array(await light.arrayBuffer()),bytes);
 const admin=await(await x.call('/api/calendar/admin/events/'+x.eventId+'/photos',{admin:true})).json();
 assert.equal(admin.photos[0].sizeBytes,1200);
 assert.equal(admin.photos[0].optimizedSizeBytes,230);
 assert.equal((await x.call(admin.photos[0].originalUrl)).headers.get('content-type'),'image/jpeg');
 assert.equal((await familyStorageUsage(x.env)).usedBytes,1430);
 const stored=x.db.prepare('SELECT object_key,optimized_key FROM calendar_event_photos').get();
 assert.ok(x.objects.has(stored.object_key));
 assert.ok(x.objects.has(stored.optimized_key));
 const events=(await(await x.call('/api/calendar/events')).json()).events;
 assert.equal(events[0].memoryCount,1);
 assert.equal(events[0].dateSort,'2026-10-15');
 assert.equal(events[0].contactPhone,'');
 assert.equal(events[0].recipientIds,undefined);
 // Member grant expires immediately when Admin removes this musician.
 const edit={...x.event,recipientIds:[M2],version:1};
 const changed=await x.call('/api/calendar/admin/events/'+x.eventId,{
  method:'POST',admin:true,body:JSON.stringify(edit),headers:{'content-type':'application/json'}
 });
 assert.equal(changed.status,200);
 assert.equal((await x.call(list.photos[0].url)).status,404);
 assert.equal((await x.call(base)).status,403);
 x.db.close();
});
test('Future and cancelled dates never reveal private photo memories to musicians',async()=>{
 const x=await setup();
 await addPhoto(x);
 const base='/api/calendar/events/'+x.eventId+'/photos';
 const future={...x.event,date:'2030-12-31',version:1};
 assert.equal((await x.call('/api/calendar/admin/events/'+x.eventId,{
  method:'POST',admin:true,body:JSON.stringify(future),headers:{'content-type':'application/json'}
 })).status,200);
 assert.equal((await x.call(base)).status,403);
 const cancelled={...future,version:2,status:'cancelled',date:'2026-10-15'};
 assert.equal((await x.call('/api/calendar/admin/events/'+x.eventId,{
  method:'POST',admin:true,body:JSON.stringify(cancelled),headers:{'content-type':'application/json'}
 })).status,200);
 assert.equal((await x.call(base)).status,403);
 x.db.close();
});
test('Deleting an event deletes its original and WebP; failed R2 deletion remains counted',async()=>{
 const x=await setup();
 const id=await addPhoto(x);
 const bytes=webp(250);
 const r=await x.call('/api/calendar/admin/events/'+x.eventId+'/photos/'+id+'/optimized',{
  admin:true,method:'POST',body:bytes,headers:{
   'content-type':'image/webp','content-length':'250','x-book-width':'1200','x-book-height':'900'
  }});
 assert.equal(r.status,200);
 x.setFailDelete(true);
 const deleted=await x.call('/api/calendar/admin/events/'+x.eventId,{
  admin:true,method:'DELETE',body:JSON.stringify({version:1}),
  headers:{'content-type':'application/json'}
 });
 assert.equal(deleted.status,200);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n,0);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM calendar_event_photos').get().n,0);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM calendar_photo_grants').get().n,0);
 assert.equal(x.db.prepare('SELECT COUNT(*) AS n FROM calendar_photo_delete_queue').get().n,2);
 assert.equal((await familyStorageUsage(x.env)).usedBytes,1450);
 assert.equal(x.objects.size,2,'R2 originals are kept until deletion successfully completes');
 x.db.close();
});
