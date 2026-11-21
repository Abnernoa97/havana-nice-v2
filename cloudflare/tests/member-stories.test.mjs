import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoriesApi,cleanupExpiredStories,STORY_DURATION_MS} from '../src/modules/stories/stories.js';

const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const FER='member:123e4567-e89b-42d3-a456-426614174001';
const NOA='member:123e4567-e89b-42d3-a456-426614174002';
const JPEG=new Uint8Array([255,216,255,224,1,2,3,255,217]);
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,active INTEGER NOT NULL)');
 db.exec('CREATE TABLE r2_member_delete_queue(object_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,multipart_upload_id TEXT,size_bytes INTEGER,queued_at INTEGER)');
 db.exec(readFileSync(new URL('../migrations/0031_member_stories.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../migrations/0032_story_conversation.sql',import.meta.url),'utf8'));
 db.prepare('INSERT INTO chat_members VALUES(?,?,1)').run(FER,'Fer');
 db.prepare('INSERT INTO chat_members VALUES(?,?,1)').run(NOA,'Noa');
 const statement=(sql,args)=>({
  async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};},
  async run(){const m=db.prepare(sql).run(...args);return {meta:{changes:m.changes}};}
 });
 const DB={prepare:sql=>Object.assign(statement(sql,[]),{bind:(...args)=>statement(sql,args)}),
  async batch(queries){for(const q of queries)await q.run();}};
 const objects=new Map(),tasks=[];
 const MEDIA_BUCKET={
  async put(key,bytes){objects.set(key,new Uint8Array(bytes));},
  async get(key){const data=objects.get(key);return data?{body:new Response(data).body,size:data.byteLength}:null;},
  async delete(key){objects.delete(key);}
 };
 const env={DB,MEDIA_BUCKET};
 async function api(path,method='GET',who='fer',data=null,mime='image/jpeg'){
  const headers=who?{Authorization:'Bearer '+who}:{};
  if(data&&!(data instanceof FormData)){headers['content-type']=mime;headers['content-length']=String(data.byteLength);}
  const req=new Request(new URL(path,BASE),{method,headers,body:data});
  return handleStoriesApi(req,env,new URL(req.url),'',async(_,token)=>{
   if(token==='fer')return {actorId:FER,displayName:'Fer'};
   if(token==='noa')return {actorId:NOA,displayName:'Noa'};
   return null;
  },{waitUntil(promise){tasks.push(promise);}});
 }
 return {db,objects,env,tasks,api};
}
test('Stories use the one musician session; unauthenticated users cannot list/upload',async()=>{
 const e=setup();
 assert.equal((await e.api('/api/stories/team','GET','')).status,401);
 assert.equal((await e.api('/api/stories/me/photo','PUT','',JPEG)).status,401);
 assert.equal((await e.api('/api/stories/team')).status,200);
 assert.equal(e.objects.size,0);
});
test('A JPG state belongs to its author, with a time-limited private read grant',async()=>{
 const e=setup();
 const publish=await e.api('/api/stories/me/photo','PUT','fer',JPEG);
 assert.equal(publish.status,201);
 const created=await publish.json();
 assert.equal(created.expiresAt-created.createdAt,STORY_DURATION_MS);
 assert.equal(e.objects.size,1);
 const result=await (await e.api('/api/stories/team')).json();
 assert.equal(result.stories.length,1);
 assert.equal(result.stories[0].actorId,FER);
 assert.equal(new URL(result.stories[0].photoUrl).origin,BASE);
 assert.match(new URL(result.stories[0].photoUrl).pathname,/^\/api\/stories\/photo\/[a-f0-9]{32}$/);
 assert.equal(JSON.stringify(result).includes('stories/member'),false,'Never expose private R2 keys');
 const image=await e.api(result.stories[0].photoUrl,'GET','');
 assert.equal(image.status,200);
 assert.equal(image.headers.get('content-type'),'image/jpeg');
 assert.deepEqual([...new Uint8Array(await image.arrayBuffer())],[...JPEG]);
 assert.equal((await e.api(result.stories[0].photoUrl,'HEAD','')).status,200);
});
test('States and signed photograph links both become inaccessible after 24 hours',async()=>{
 const e=setup();
 await e.api('/api/stories/me/photo','PUT','fer',JPEG);
 const result=await (await e.api('/api/stories/team')).json();
 const id=result.stories[0].id,now=Date.now();
 e.db.prepare('UPDATE member_stories SET created_at=?,expires_at=? WHERE id=?')
  .run(now-STORY_DURATION_MS-10,now-10,id);
 assert.equal((await e.api(result.stories[0].photoUrl,'GET','')).status,404);
 assert.equal((await (await e.api('/api/stories/team')).json()).stories.length,0);
 await cleanupExpiredStories(e.env);
 assert.equal(e.objects.size,0,'Expired originals must be reclaimed from R2');
 assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM member_stories').get().n,0);
});
test('Only the author can delete a story, never another musician',async()=>{
 const e=setup();
 await e.api('/api/stories/me/photo','PUT','fer',JPEG);
 const result=await (await e.api('/api/stories/team')).json();
 const path='/api/stories/me/'+result.stories[0].id;
 assert.equal((await e.api(path,'DELETE','noa')).status,404);
 assert.equal((await e.api(path,'DELETE','fer')).status,200);
 assert.equal(e.objects.size,0);
 assert.equal((await e.api(result.stories[0].photoUrl,'GET','')).status,404);
});
test('Invalid media, missing permission and more than 12 active states are rejected',async()=>{
 const e=setup();
 assert.equal((await e.api('/api/stories/me/photo','PUT','fer',JPEG,'image/png')).status,415);
 assert.equal((await e.api('/api/stories/me/photo','PUT','fer',new Uint8Array([1,2,3,4]))).status,415);
 assert.equal((await e.api('/api/stories/me/photo','PUT','fer',new Uint8Array(1_500_001))).status,413);
 const now=Date.now();
 for(let i=0;i<12;i++)e.db.prepare(
  'INSERT INTO member_stories VALUES(?,?,?,?,?,?)'
 ).run('123e4567-e89b-42d3-a456-'+String(i).padStart(12,'0'),
  FER,'stories/test/'+i,9,now,now+STORY_DURATION_MS);
 assert.equal((await e.api('/api/stories/me/photo','PUT','fer',JPEG)).status,409);
});
test('An inactive member loses the ability to expose stories',async()=>{
 const e=setup();
 await e.api('/api/stories/me/photo','PUT','fer',JPEG);
 const result=await (await e.api('/api/stories/team')).json();
 e.db.prepare('UPDATE chat_members SET active=0 WHERE actor_id=?').run(FER);
 assert.equal((await e.api(result.stories[0].photoUrl,'GET','')).status,404);
 const roster=await (await e.api('/api/stories/team','GET','noa')).json();
 assert.equal(roster.stories.length,0);
});

function batch(count,invalidAt=-1){
 const form=new FormData();
 for(let i=0;i<count;i++){
  const bytes=i===invalidAt?new Uint8Array([1,2,3,4]):
   new Uint8Array([255,216,255,224,i,2,3,255,217]);
  form.append('photos',new Blob([bytes],{type:'image/jpeg'}),'estado-'+i+'.jpg');
 }
 return form;
}
test('One upload publishes five photos in order with exactly 24h lifetime',async()=>{
 const e=setup();
 const reply=await e.api('/api/stories/me/batch','POST','fer',batch(5));
 assert.equal(reply.status,201);
 const payload=await reply.json();
 assert.equal(payload.count,5);
 assert.equal(e.objects.size,5);
 const items=(await (await e.api('/api/stories/team')).json()).stories;
 assert.equal(items.length,5);
 assert.deepEqual(items.map(x=>x.id),payload.ids,'Gallery selection order must be preserved');
 assert.ok(items.every(x=>x.expiresAt-x.createdAt===STORY_DURATION_MS));
 for(let i=1;i<items.length;i++)assert.ok(items[i].createdAt>items[i-1].createdAt);
});
test('Six photos, mixed invalid format, and exceeding the active limit reject the entire batch',async()=>{
 const e=setup();
 assert.equal((await e.api('/api/stories/me/batch','POST','fer',batch(6))).status,400);
 assert.equal((await e.api('/api/stories/me/batch','POST','fer',batch(3,1))).status,415);
 assert.equal(e.objects.size,0);
 const now=Date.now();
 for(let i=0;i<10;i++)e.db.prepare('INSERT INTO member_stories VALUES(?,?,?,?,?,?)').run(
  '123e4567-e89b-42d3-a456-'+String(i).padStart(12,'0'),FER,'stories/test/'+i,9,now,now+STORY_DURATION_MS
 );
 assert.equal((await e.api('/api/stories/me/batch','POST','fer',batch(3))).status,409);
 assert.equal(e.objects.size,0);
 assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM member_stories').get().n,10);
});
test('R2 failure on the third photo rolls back earlier uploads without creating states',async()=>{
 const e=setup();
 const original=e.env.MEDIA_BUCKET.put.bind(e.env.MEDIA_BUCKET);
 let calls=0;
 e.env.MEDIA_BUCKET.put=async(...args)=>{
  calls++;if(calls===3)throw Error('R2 temporarily unavailable');
  return original(...args);
 };
 const reply=await e.api('/api/stories/me/batch','POST','fer',batch(5));
 assert.equal(reply.status,503);
 assert.equal(e.objects.size,0);
 assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM member_stories').get().n,0);
 assert.equal(e.db.prepare('SELECT COUNT(*) AS n FROM r2_member_delete_queue').get().n,0);
});
test('Bulk upload requires the same authorized musician identity as single photo upload',async()=>{
 const e=setup();
 assert.equal((await e.api('/api/stories/me/batch','POST','',batch(2))).status,401);
 assert.equal(e.objects.size,0);
});
