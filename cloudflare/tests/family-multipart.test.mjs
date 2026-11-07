import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {FAMILY_PART_BYTES,familyMultipartRoute,handleFamilyMultipart} from '../src/modules/family/family-multipart.js';

const ACTOR='member:123e4567-e89b-42d3-a456-426614174001';
const ROOT='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
function setup(){
 const raw=new DatabaseSync(':memory:');
 raw.exec('PRAGMA foreign_keys=ON; CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER);');
 raw.prepare('INSERT INTO chat_members VALUES(?,?,?)').run(ACTOR,'Andy',1);
 for(const file of ['0021_family_media.sql','0022_family_upload_sessions.sql','0023_family_video_posters.sql','0024_family_storage_budget.sql'])
  raw.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 raw.exec('CREATE TABLE chat_messages(seq INTEGER PRIMARY KEY)');
 raw.exec(readFileSync(new URL('../migrations/0025_chat_media_r2.sql',import.meta.url),'utf8'));
 raw.exec(readFileSync(new URL('../migrations/0026_member_delete_media_cleanup.sql',import.meta.url),'utf8'));
 raw.exec(readFileSync(new URL('../migrations/0027_book_havana_nice.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){return {bind(...args){return {
  async first(){return raw.prepare(sql).get(...args)||null;},
  async all(){return {results:raw.prepare(sql).all(...args)};},
  async run(){return raw.prepare(sql).run(...args)}
 };},async first(){return raw.prepare(sql).get()||null;}};},
 async batch(stmts){raw.exec('BEGIN');try{const result=[];for(const stmt of stmts)result.push(await stmt.run());raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}
 };
 const uploads=new Map(),completed=new Map();
 let next=0;
 const MEDIA_BUCKET={
  async createMultipartUpload(key,opts){
   const uploadId='upload-'+(++next);
   uploads.set(key,{uploadId,parts:new Map(),opts});
   return {uploadId,async abort(){uploads.delete(key);}};
  },
  resumeMultipartUpload(key,uploadId){
   const get=()=>{const saved=uploads.get(key);if(!saved||saved.uploadId!==uploadId)throw Error('no upload');return saved;};
   return {
    async uploadPart(number,body){
     const bytes=new Uint8Array(await new Response(body).arrayBuffer());
     get().parts.set(number,bytes);
     return {partNumber:number,etag:'etag-'+number};
    },
    async complete(parts){
     const stored=get(),pieces=parts.map(part=>{
      if(part.etag!=='etag-'+part.partNumber)throw Error('etag mismatch');
      return stored.parts.get(part.partNumber);
     });
     const size=pieces.reduce((n,p)=>n+p.byteLength,0);
     completed.set(key,{size,pieces});
     uploads.delete(key);
     return {size};
    },
    async abort(){uploads.delete(key);}
   };
  },
  async delete(key){completed.delete(key);}
 };
 return {DB,MEDIA_BUCKET,raw,uploads,completed,env:{DB,MEDIA_BUCKET}};
}
async function begin(env,size=FAMILY_PART_BYTES*2+101){
 const route=familyMultipartRoute('/api/family/admin/albums/'+encodeURIComponent(ACTOR)+'/multipart');
 const request=new Request(ROOT+'/api/family/admin/albums/'+encodeURIComponent(ACTOR)+'/multipart',{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({mimeType:'video/mp4',sizeBytes:size})
 });
 const response=await handleFamilyMultipart(request,env,route);
 return {response,data:await response.json(),route};
}
function routeFor(id,suffix){
 const path='/api/family/admin/albums/'+encodeURIComponent(ACTOR)+'/multipart/'+id+suffix;
 return {path,route:familyMultipartRoute(path)};
}
test('private large video multipart: parts can upload concurrently and join in original order',async()=>{
 const {env,raw,completed,uploads}=setup();
 const {response,data}=await begin(env);
 assert.equal(response.status,201);
 assert.equal(data.partSize,FAMILY_PART_BYTES);
 assert.equal(data.partCount,3);
 assert.ok(data.id);
 for(const number of [3,1,2]){
  const length=number===3?101:FAMILY_PART_BYTES;
  const {path,route}=routeFor(data.id,'/parts/'+number);
  const body=new Uint8Array(length);body.fill(number);
  const req=new Request(ROOT+path,{method:'POST',headers:{'content-length':String(length)},body});
  const res=await handleFamilyMultipart(req,env,route);
  assert.equal(res.status,200);
 }
 const end=routeFor(data.id,'/complete');
 const res=await handleFamilyMultipart(new Request(ROOT+end.path,{method:'POST'}),env,end.route);
 assert.equal(res.status,201);
 assert.equal(uploads.size,0);
 assert.equal(completed.size,1);
 const file=raw.prepare('SELECT actor_id,kind,size_bytes,object_key FROM family_media').get();
 assert.equal(file.actor_id,ACTOR);
 assert.equal(file.kind,'video');
 assert.equal(file.size_bytes,FAMILY_PART_BYTES*2+101);
 const recorded=completed.get(file.object_key);
 assert.deepEqual(recorded.pieces.map(p=>p[0]),[1,2,3]);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_upload_sessions').get().n,0);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_upload_parts').get().n,0);
 raw.close();
});
test('transient mobile failure preserves uploaded parts and resumes same R2 object',async()=>{
 const {env,raw,completed,uploads}=setup();
 const {data}=await begin(env);
 const partOne=routeFor(data.id,'/parts/1');
 const requestOne=new Request(ROOT+partOne.path,{method:'POST',
  headers:{'content-length':String(FAMILY_PART_BYTES)},body:new Uint8Array(FAMILY_PART_BYTES)});
 assert.equal((await handleFamilyMultipart(requestOne,env,partOne.route)).status,200);
 const statusRoute=routeFor(data.id,'');
 const status=await handleFamilyMultipart(new Request(ROOT+statusRoute.path,{method:'GET'}),env,statusRoute.route);
 assert.equal(status.status,200);
 assert.deepEqual((await status.json()).completedParts,[1]);
 assert.equal(uploads.size,1);
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM family_upload_sessions').get().n,1);
 for(const i of [2,3]){
  const path=routeFor(data.id,'/parts/'+i);
  const bytes=new Uint8Array(i===3?101:FAMILY_PART_BYTES);
  const request=new Request(ROOT+path.path,{method:'POST',headers:{'content-length':String(bytes.length)},body:bytes});
  assert.equal((await handleFamilyMultipart(request,env,path.route)).status,200);
 }
 const done=routeFor(data.id,'/complete');
 assert.equal((await handleFamilyMultipart(new Request(ROOT+done.path,{method:'POST'}),env,done.route)).status,201);
 const completedStatus=await handleFamilyMultipart(new Request(ROOT+statusRoute.path,{method:'GET'}),env,statusRoute.route);
 assert.deepEqual(await completedStatus.json(),{id:data.id,complete:true});
 assert.equal(completed.size,1);
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM family_media').get().n,1);
 raw.close();
});
test('missing or mislabeled parts reject completion; authorized abort removes draft',async()=>{
 const {env,raw,uploads}=setup();
 const {data}=await begin(env);
 const {path,route}=routeFor(data.id,'/parts/1');
 const bad=new Request(ROOT+path,{method:'POST',headers:{'content-length':'100'},body:new Uint8Array(100)});
 assert.equal((await handleFamilyMultipart(bad,env,route)).status,400);
 const done=routeFor(data.id,'/complete');
 assert.equal((await handleFamilyMultipart(new Request(ROOT+done.path,{method:'POST'}),env,done.route)).status,409);
 const abort=routeFor(data.id,'');
 assert.equal((await handleFamilyMultipart(new Request(ROOT+abort.path,{method:'DELETE'}),env,abort.route)).status,200);
 assert.equal(uploads.size,0);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_upload_sessions').get().n,0);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM family_media').get().n,0);
 raw.close();
});
test('only explicitly named Admin multipart paths are recognized',()=>{
 const prefix='/api/family/admin/albums/'+encodeURIComponent(ACTOR)+'/multipart';
 assert.deepEqual(familyMultipartRoute(prefix),{actorId:ACTOR,id:null,part:null,complete:false});
 assert.equal(familyMultipartRoute(prefix+'/../../private'),null);
 assert.equal(familyMultipartRoute(prefix.replace('/admin/','/')),null);
 assert.equal(familyMultipartRoute(prefix+'/not-a-valid-id'),null);
});
