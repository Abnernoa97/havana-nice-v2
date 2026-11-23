import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoriesApi,cleanupExpiredStories,STORY_DURATION_MS} from '../src/modules/stories/stories.js';

const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const FER='member:123e4567-e89b-42d3-a456-426614174001';
const NOA='member:123e4567-e89b-42d3-a456-426614174002';
const JPEG=new Uint8Array([255,216,4,3,2,255,217]);
function setup(){
 const raw=new DatabaseSync(':memory:');
 raw.exec('PRAGMA foreign_keys=ON');
 raw.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,active INTEGER NOT NULL)');
 raw.exec('CREATE TABLE r2_member_delete_queue(object_key TEXT PRIMARY KEY,actor_id TEXT NOT NULL,multipart_upload_id TEXT,size_bytes INTEGER,queued_at INTEGER)');
 for(const id of ['0031_member_stories.sql','0032_story_conversation.sql','0033_story_laugh_reaction.sql'])
  raw.exec(readFileSync(new URL('../migrations/'+id,import.meta.url),'utf8'));
 raw.prepare('INSERT INTO chat_members VALUES(?,?,1)').run(FER,'Fer');
 raw.prepare('INSERT INTO chat_members VALUES(?,?,1)').run(NOA,'Noa');
 const stmt=(sql,args)=>({
  async first(){return raw.prepare(sql).get(...args)||null;},
  async all(){return {results:raw.prepare(sql).all(...args)};},
  async run(){const meta=raw.prepare(sql).run(...args);return {meta};}
 });
 const DB={prepare:sql=>Object.assign(stmt(sql,[]),{bind:(...args)=>stmt(sql,args)}),
  async batch(items){for(const item of items)await item.run();}};
 const objects=new Map();
 const MEDIA_BUCKET={
  async put(key,body){objects.set(key,new Uint8Array(body));},
  async get(key,options){
   const item=objects.get(key);if(!item)return null;
   const part=options?.range?item.slice(options.range.offset,options.range.offset+options.range.length):item;
   return {body:new Response(part).body,size:part.byteLength};
  },
  async delete(key){objects.delete(key);}
 };
 const env={DB,MEDIA_BUCKET};
 async function api(path,method='GET',who='fer',data=null,mime){
  const headers=who?{Authorization:'Bearer '+who}:{};
  if(data&&!(data instanceof FormData)){
   headers['content-type']=mime||'application/json';
  }
  const r=new Request(new URL(path,BASE),{method,headers,
   body:data==null?undefined:typeof data==='object'&&!(data instanceof Uint8Array)&&!(data instanceof Blob)&&!(data instanceof FormData)?
    JSON.stringify(data):data});
  return handleStoriesApi(r,env,new URL(r.url),'',async(_,token)=>token==='fer'?
   {actorId:FER,displayName:'Fer'}:token==='noa'?{actorId:NOA,displayName:'Noa'}:null,
   {waitUntil(){}});
 }
 async function story(){
  const r=await api('/api/stories/me/photo','PUT','fer',JPEG,'image/jpeg');
  assert.equal(r.status,201);
  return (await r.json()).id;
 }
 return {raw,objects,env,api,story};
}
test('Comments are public within authorized team, not private Chat messages',async()=>{
 const e=setup(),id=await e.story();
 const path='/api/stories/'+id;
 assert.equal((await e.api(path+'/conversation','GET','')).status,401);
 assert.equal((await e.api(path+'/text','POST','',{text:'hola'})).status,401);
 assert.equal((await e.api(path+'/text','POST','noa',{text:'Wow, increíble!'})).status,201);
 const res=await e.api(path+'/conversation','GET','fer');
 assert.equal(res.status,200);
 const doc=await res.json();
 assert.equal(doc.comments.length,1);
 assert.equal(doc.comments[0].name,'Noa');
 assert.equal(doc.comments[0].text,'Wow, increíble!');
 assert.equal(doc.comments[0].kind,'text');
 assert.deepEqual(doc.reactions,{'❤️':0,'👏':0,'😂':0});
 assert.equal(e.raw.prepare('SELECT COUNT(*) AS n FROM member_story_comments').get().n,1);
});
test('Hearts and claps are persisted once per tap and read by other members',async()=>{
 const e=setup(),id=await e.story();
 const path='/api/stories/'+id;
 assert.equal((await e.api(path+'/reaction','POST','noa',{emoji:'❤️'})).status,200);
 assert.equal((await e.api(path+'/reaction','POST','noa',{emoji:'❤️'})).status,200);
 assert.equal((await e.api(path+'/reaction','POST','fer',{emoji:'👏'})).status,200);
 assert.equal((await e.api(path+'/reaction','POST','fer',{emoji:'😂'})).status,200);
 assert.equal((await e.api(path+'/reaction','POST','fer',{emoji:'not-allowed'})).status,400);
 const doc=await (await e.api(path+'/conversation','GET','fer')).json();
 assert.deepEqual(doc.reactions,{'❤️':2,'👏':1,'😂':1});
});
test('Voice notes are visible to the team and support Safari byte ranges',async()=>{
 const e=setup(),id=await e.story(),path='/api/stories/'+id;
 const audio=new Uint8Array([0,0,0,12,102,116,121,112,1,2,3,4]);
 assert.equal((await e.api(path+'/voice','POST','noa',audio,'audio/mp4')).status,201);
 const doc=await (await e.api(path+'/conversation','GET','fer')).json();
 assert.equal(doc.comments[0].name,'Noa');
 assert.equal(doc.comments[0].kind,'voice');
 assert.ok(doc.comments[0].voiceUrl?.startsWith(BASE+'/api/stories/voice/'));
 const fetchVoice=await e.api(doc.comments[0].voiceUrl,'GET','');
 assert.equal(fetchVoice.status,200);
 assert.equal(fetchVoice.headers.get('content-type'),'audio/mp4');
 assert.deepEqual([...new Uint8Array(await fetchVoice.arrayBuffer())],[...audio]);
 const token=new URL(doc.comments[0].voiceUrl).pathname;
 const headers={Range:'bytes=2-5'};
 const req=new Request(BASE+token,{headers});
 const partial=await handleStoriesApi(req,e.env,new URL(req.url),'',async()=>null,{waitUntil(){}});
 assert.equal(partial.status,206);
 assert.equal(partial.headers.get('content-range'),'bytes 2-5/12');
 assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())],[...audio.slice(2,6)]);
});
test('Expired stories revoke text, audio, reactions and delete voice objects',async()=>{
 const e=setup(),id=await e.story(),path='/api/stories/'+id;
 await e.api(path+'/voice','POST','noa',new Uint8Array([0,1,2]),'audio/mp4');
 await e.api(path+'/text','POST','noa',{text:'prueba'});
 await e.api(path+'/reaction','POST','noa',{emoji:'❤️'});
 const voice=(await (await e.api(path+'/conversation')).json()).comments.find(x=>x.kind==='voice').voiceUrl;
 assert.equal(e.objects.size,2);
 const now=Date.now();
 e.raw.prepare('UPDATE member_stories SET created_at=?,expires_at=? WHERE id=?')
  .run(now-STORY_DURATION_MS-10,now-10,id);
 assert.equal((await e.api(path+'/conversation')).status,404);
 assert.equal((await e.api(voice,'GET','')).status,404);
 await cleanupExpiredStories(e.env);
 assert.equal(e.objects.size,0);
 assert.equal(e.raw.prepare('SELECT COUNT(*) AS n FROM member_story_comments').get().n,0);
 assert.equal(e.raw.prepare('SELECT COUNT(*) AS n FROM member_story_reactions').get().n,0);
});
test('Revoked senders and expired grants cannot access earlier voice notes',async()=>{
 const e=setup(),id=await e.story(),path='/api/stories/'+id;
 await e.api(path+'/voice','POST','noa',new Uint8Array([5,6]),'audio/mp4');
 const voice=(await (await e.api(path+'/conversation')).json()).comments[0].voiceUrl;
 e.raw.prepare('UPDATE member_story_voice_grants SET expires_at=1').run();
 assert.equal((await e.api(voice,'GET','')).status,404);
 e.raw.prepare('UPDATE chat_members SET active=0 WHERE actor_id=?').run(NOA);
 const doc=await (await e.api(path+'/conversation','GET','fer')).json();
 assert.equal(doc.comments.length,0);
});

test('Reaction receipts are attributed to each sender, with each repeated emoji counted',async()=>{
 const e=setup();
 await e.api('/api/stories/me/photo','PUT','fer',JPEG);
 const listed=await (await e.api('/api/stories/team')).json();
 const id=listed.stories[0].id,path='/api/stories/'+id;
 for(let i=0;i<4;i++)await e.api(path+'/reaction','POST','noa',{emoji:'❤️'});
 await e.api(path+'/reaction','POST','fer',{emoji:'👏'});
 const reply=await (await e.api(path+'/conversation')).json();
 assert.equal(reply.reactions['❤️'],4);
 assert.ok(reply.reactionDetails.some(x=>x.name==='Noa'&&x.emoji==='❤️'&&x.count===4));
 assert.ok(reply.reactionDetails.some(x=>x.name==='Fer'&&x.emoji==='👏'&&x.count===1));
});
