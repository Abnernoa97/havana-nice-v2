import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {startChatMedia,uploadChatDirect,uploadChatPart,completeChatMedia,chatMediaStatus,
 sendChatMedia,grantChatMedia,readChatMedia,decorateChatMessages,CHAT_PART_BYTES} from '../src/modules/chat/chat-media.js';
import {deleteChatMessageRecord} from '../src/modules/chat/message-removal.js';
import {familyStorageUsage} from '../src/modules/family/family-quota.js';

const actor='member:123e4567-e89b-42d3-a456-426614174001';
const another='member:123e4567-e89b-42d3-a456-426614174002';
const session={actorId:actor,displayName:'Fer'};
const base='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev/api/chat/media/';
const migration=name=>readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8');
function fixture(){
 const raw=new DatabaseSync(':memory:');
 raw.exec('PRAGMA foreign_keys=ON; CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,active INTEGER);'+
  'CREATE TABLE chat_messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,client_message_id TEXT NOT NULL,'+
  'sender_id TEXT NOT NULL,sender_name TEXT NOT NULL,body TEXT NOT NULL CHECK(length(body)>0),'+
  'created_at TEXT NOT NULL,reply_to_seq INTEGER,edited_at TEXT,deleted_at TEXT,'+
  'UNIQUE(sender_id,client_message_id));'+
  'CREATE TABLE chat_reactions(message_seq INTEGER,actor_id TEXT,emoji TEXT);');
 raw.prepare('INSERT INTO chat_members VALUES(?,1)').run(actor);
 raw.prepare('INSERT INTO chat_members VALUES(?,1)').run(another);
 for(const name of ['0021_family_media.sql','0022_family_upload_sessions.sql',
  '0023_family_video_posters.sql','0024_family_storage_budget.sql','0025_chat_media_r2.sql',
  '0026_member_delete_media_cleanup.sql','0027_book_havana_nice.sql','0028_book_optimized_images.sql'])
  raw.exec(migration(name));
 const DB={prepare(sql){return {
  bind(...args){return {
   async first(){return raw.prepare(sql).get(...args)||null;},
   async all(){return {results:raw.prepare(sql).all(...args)};},
   async run(){const result=raw.prepare(sql).run(...args);return {meta:{changes:result.changes},...result};}
  };},
  async first(){return raw.prepare(sql).get()||null;}
 };},
 async batch(stmts){
  raw.exec('BEGIN');
  try{const results=[];for(const statement of stmts)results.push(await statement.run());
   raw.exec('COMMIT');return results;}
  catch(e){raw.exec('ROLLBACK');throw e;}
 }};
 const objects=new Map(),multipart=new Map(),signals=[];
 const bucket={
  async put(key,body){const bytes=new Uint8Array(await new Response(body).arrayBuffer());
   objects.set(key,bytes);return {size:bytes.length};},
  async head(key){const bytes=objects.get(key);return bytes?{size:bytes.length}:null;},
  async delete(key){objects.delete(key);},
  async get(key,options={}){
   const bytes=objects.get(key);
   if(!bytes)return null;
   const rangeHeader=options.range?.get?.('range');
   const match=/^bytes=(\d+)-(\d*)$/.exec(rangeHeader||'');
   const start=match?Number(match[1]):0;
   const end=match?(match[2]?Number(match[2]):bytes.length-1):bytes.length-1;
   const part=bytes.slice(start,end+1);
   return {size:bytes.length,range:match?{offset:start,length:part.length}:undefined,
    body:new Response(part).body};
  },
  async createMultipartUpload(key){
   const uploadId=crypto.randomUUID();multipart.set(key,{uploadId,parts:new Map()});
   return {uploadId,async abort(){multipart.delete(key);}};
  },
  resumeMultipartUpload(key,uploadId){
   const get=()=>{const item=multipart.get(key);if(!item||item.uploadId!==uploadId)throw Error('Unknown upload');return item;};
   return {
    async uploadPart(number,body){const bytes=new Uint8Array(await new Response(body).arrayBuffer());
     const etag='part-'+number+'-'+bytes.length;get().parts.set(number,{bytes,etag});return {etag};},
    async complete(parts){
     const saved=get();let length=0;
     for(const item of parts){const part=saved.parts.get(item.partNumber);
      if(!part||part.etag!==item.etag)throw Error('Wrong part');length+=part.bytes.length;}
     const buffer=new Uint8Array(length);let offset=0;
     for(const item of parts){const part=saved.parts.get(item.partNumber);buffer.set(part.bytes,offset);offset+=part.bytes.length;}
     objects.set(key,buffer);multipart.delete(key);return {size:length};
    },
    async abort(){multipart.delete(key);}
   };
  }
 };
 const env={DB,MEDIA_BUCKET:bucket,CHAT_ROOMS:{idFromName:x=>x,get:()=>({
  async fetch(url,init){signals.push({url,body:JSON.parse(init.body)});return Response.json({ok:true});}
 })}};
 return {env,raw,objects,signals,multipart};
}
const request=(url,method,headers={},body)=>new Request(url,{method,headers,body});
async function start(env,id,size,mime='image/jpeg',kind='photo'){
 const res=await startChatMedia(request(base+'start','POST',{'content-type':'application/json'},
  JSON.stringify({id,kind,mimeType:mime,sizeBytes:size,name:'Original personal'})),env,session,'');
 return {status:res.status,body:await res.json()};
}
test('direct private original: reserved budget -> ready -> one message -> two role-capable read grants -> delete',async()=>{
 const {env,raw,signals,objects}=fixture();
 const id=crypto.randomUUID(),bytes=new Uint8Array([255,216,255,217]);
 assert.equal((await start(env,id,4)).status,201);
 assert.equal((await familyStorageUsage(env)).pendingBytes,4);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,0);
 const content=await uploadChatDirect(request(base+id+'/content','PUT',
  {'Content-Type':'image/jpeg','Content-Length':'4'},bytes),env,session,id,'');
 assert.equal(content.status,201);
 assert.equal((await familyStorageUsage(env)).usedBytes,4);
 assert.equal((await familyStorageUsage(env)).pendingBytes,0);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,0);
 const first=await sendChatMedia(env,session,id,'');
 assert.equal(first.status,201);
 const seq=(await first.json()).seq;
 const second=await sendChatMedia(env,session,id,'');
 assert.equal(second.status,200);
 assert.equal((await second.json()).seq,seq);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,1);
 assert.equal(signals.length,1);
 const decorated=await decorateChatMessages(env,[{seq,text:'Foto',senderId:actor}]);
 assert.deepEqual(decorated,[{seq,text:'',senderId:actor,
  media:{assetId:id,kind:'photo',mimeType:'image/jpeg',sizeBytes:4,name:'Original personal'}}]);
 const grant=await grantChatMedia(env,id,'');
 assert.equal(grant.status,200);
 const url=(await grant.json()).url;
 const image=await readChatMedia(request(url,'GET',{'Range':'bytes=1-2'}),env,id,new URL(url),'');
 assert.equal(image.status,206);
 assert.equal(image.headers.get('content-range'),'bytes 1-2/4');
 assert.deepEqual([...new Uint8Array(await image.arrayBuffer())],[216,255]);
 assert.equal((await chatMediaStatus(env,{actorId:another},id,'')).status,404);
 assert.equal(await deleteChatMessageRecord(env,seq),true);
 assert.equal(objects.size,0);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM chat_media_grants').get().n,0);
 assert.equal((await familyStorageUsage(env)).usedBytes,0);
 raw.close();
});
test('multipart original resumes only missing parts and never publishes incomplete videos',async()=>{
 const {env,raw}=fixture();
 const id=crypto.randomUUID(),size=CHAT_PART_BYTES*3+113;
 const started=await start(env,id,size,'video/mp4','video');
 assert.equal(started.status,201);
 assert.equal(started.body.partCount,4);
 assert.equal(started.body.multipart,true);
 assert.equal((await familyStorageUsage(env)).pendingBytes,size);
 const part=new Uint8Array(CHAT_PART_BYTES);
 const sent=await uploadChatPart(request(base+id+'/parts/1','PUT',{'Content-Length':String(CHAT_PART_BYTES)},part),env,session,id,1,'');
 assert.equal(sent.status,200);
 assert.deepEqual((await (await chatMediaStatus(env,session,id,'')).json()).completedParts,[1]);
 assert.equal((await completeChatMedia(env,session,id,'')).status,409);
 for(const number of [2,3,4]){
  const count=number===4?113:CHAT_PART_BYTES;
  const data=new Uint8Array(count);
  const r=await uploadChatPart(request(base+id+'/parts/'+number,'PUT',{'Content-Length':String(count)},data),env,session,id,number,'');
  assert.equal(r.status,200);
 }
 assert.equal((await completeChatMedia(env,session,id,'')).status,201);
 assert.equal((await sendChatMedia(env,session,id,'')).status,201);
 assert.equal(raw.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,1);
 assert.equal((await familyStorageUsage(env)).usedBytes,size);
 raw.close();
});
