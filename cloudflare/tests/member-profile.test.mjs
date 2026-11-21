import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleProfileApi} from '../src/modules/profile/profile.js';

const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const FER='member:123e4567-e89b-42d3-a456-426614174001';
const NOA='member:123e4567-e89b-42d3-a456-426614174002';
function setup(){
 const raw=new DatabaseSync(':memory:');
 raw.exec('PRAGMA foreign_keys=ON');
 raw.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY, display_name TEXT NOT NULL,active INTEGER NOT NULL)');
 raw.exec('CREATE TABLE r2_member_delete_queue(object_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,multipart_upload_id TEXT,size_bytes INTEGER,queued_at INTEGER)');
 raw.exec(readFileSync(new URL('../migrations/0030_member_profiles.sql',import.meta.url),'utf8'));
 raw.prepare('INSERT INTO chat_members VALUES(?,?,?)').run(FER,'Fer',1);
 raw.prepare('INSERT INTO chat_members VALUES(?,?,?)').run(NOA,'Noa',1);
 const prepare=sql=>({bind(...args){return {
  async first(){return raw.prepare(sql).get(...args)||null;},
  async all(){return {results:raw.prepare(sql).all(...args)};},
  async run(){const meta=raw.prepare(sql).run(...args);return {meta:{changes:meta.changes}};}
 };}});
 const DB={prepare,async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
 const objects=new Map(),tasks=[];
 const MEDIA_BUCKET={
  async put(key,body){objects.set(key,new Uint8Array(body));},
  async get(key){
   const bytes=objects.get(key);return bytes?{size:bytes.byteLength,body:new Response(bytes).body}:null;
  },
  async delete(key){objects.delete(key);}
 };
 const env={DB,MEDIA_BUCKET};
 async function api(path,method='GET',token='fer',data=null,mime='image/jpeg'){
  const headers=token?{Authorization:'Bearer '+token}:{};
  if(data){headers['Content-Type']=mime;headers['Content-Length']=String(data.byteLength);}
  const request=new Request(BASE+path,{method,headers,body:data});
  const response=await handleProfileApi(request,env,new URL(request.url),'',
   async(_e,value)=>value==='fer'?{actorId:FER,displayName:'Fer'}:
    value==='noa'?{actorId:NOA,displayName:'Noa'}:null,
   {waitUntil(task){tasks.push(task);}});
  return response;
 }
 return {api,raw,objects,tasks};
}
const jpg=new Uint8Array([0xff,0xd8,0xff,0xe0,0,2,0xff,0xd9]);
test('Profile identity comes from authorized session, no alternate name or login',async()=>{
 const env=setup();
 assert.equal((await env.api('/api/profile/team','GET','')).status,401);
 assert.equal((await env.api('/api/profile/me/photo','PUT','',jpg)).status,401);
 const profiles=await (await env.api('/api/profile/team')).json();
 assert.deepEqual(profiles.profiles.map(x=>x.name),['Fer','Noa']);
 assert.ok(profiles.profiles.every(x=>x.photoUrl===null));
});
test('Member upload creates one private R2 photo and signed team avatars',async()=>{
 const e=setup();
 const upload=await e.api('/api/profile/me/photo','PUT','fer',jpg);
 assert.equal(upload.status,200);
 const body=await upload.json();
 assert.equal(body.actorId,FER);
 assert.equal(e.objects.size,1);
 const roster=await (await e.api('/api/profile/team')).json();
 assert.equal(roster.profiles[0].name,'Fer');
 assert.match(roster.profiles[0].photoUrl,/^\/api\/profile\/photo\/[a-f0-9]{32}$/);
 assert.equal(roster.profiles[1].photoUrl,null);
 assert.equal(JSON.stringify(roster).includes('profiles/member'),false,'R2 keys are never exposed');
 const asset=await e.api(roster.profiles[0].photoUrl,'GET','');
 assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/jpeg');
 assert.deepEqual([...new Uint8Array(await asset.arrayBuffer())],[...jpg]);
 assert.equal((await e.api(roster.profiles[0].photoUrl,'GET','')).headers.get('cache-control'),'private,no-store');
});
test('Profile uploads reject invalid format/size and cannot overwrite another member',async()=>{
 const e=setup();
 assert.equal((await e.api('/api/profile/me/photo','PUT','fer',jpg,'image/png')).status,415);
 assert.equal((await e.api('/api/profile/me/photo','PUT','fer',new Uint8Array([1,2,3,4]))).status,415);
 assert.equal((await e.api('/api/profile/me/photo','PUT','fer',new Uint8Array(1_500_001))).status,413);
 const valid=await e.api('/api/profile/me/photo','PUT','noa',jpg);
 assert.equal(valid.status,200);
 const roster=await (await e.api('/api/profile/team')).json();
 assert.equal(roster.profiles[0].photoUrl,null);
 assert.ok(roster.profiles[1].photoUrl);
});
test('Replacing a photo retires old grants, R2 original and leaves the member session alone',async()=>{
 const e=setup();
 await e.api('/api/profile/me/photo','PUT','fer',jpg);
 const first=await (await e.api('/api/profile/team')).json();
 await e.api('/api/profile/me/photo','PUT','fer',new Uint8Array([0xff,0xd8,4,3,2,1,0xff,0xd9]));
 await Promise.all(e.tasks);
 assert.equal(e.objects.size,1);
 assert.equal((await e.api(first.profiles[0].photoUrl,'GET','')).status,404);
 assert.equal(e.raw.prepare('SELECT COUNT(*) n FROM member_profiles').get().n,1);
});
test('Revoked member cannot retrieve avatar grants and expired links are denied',async()=>{
 const e=setup();
 await e.api('/api/profile/me/photo','PUT','fer',jpg);
 const first=await (await e.api('/api/profile/team')).json();
 e.raw.prepare('UPDATE member_profile_grants SET expires_at=1').run();
 assert.equal((await e.api(first.profiles[0].photoUrl,'GET','')).status,404);
 e.raw.prepare('UPDATE chat_members SET active=0 WHERE actor_id=?').run(FER);
 const listed=await (await e.api('/api/profile/team','GET','noa')).json();
 assert.deepEqual(listed.profiles.map(p=>p.name),['Noa']);
});
