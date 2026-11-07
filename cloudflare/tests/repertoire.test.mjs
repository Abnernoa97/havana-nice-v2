import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleRepertoireApi} from '../src/modules/repertoire/repertoire.js';

const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const TOKEN='A'.repeat(43);
const NOA='member:123e4567-e89b-42d3-a456-426614174001';
const FER='member:123e4567-e89b-42d3-a456-426614174002';
const EVENT='ca0ad4ed-1438-423e-8614-cc882000abcd';
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
class D1{
 constructor(){
  this.raw=new DatabaseSync(':memory:');
  this.raw.exec('PRAGMA foreign_keys=ON; CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER);'+
   'CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER);');
  for(const file of ['0018_calendar_events.sql','0020_repertoire.sql'])
   this.raw.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  for(const [id,name] of [[NOA,'Noa'],[FER,'Fer']])this.raw.prepare('INSERT INTO chat_members VALUES (?,?,1)').run(id,name);
  this.raw.prepare('INSERT INTO calendar_events(id,event_date,title,revision_token,created_at,updated_at) VALUES (?,?,?,?,?,?)')
   .run(EVENT,'2026-12-14','Boda','revision-1',new Date().toISOString(),new Date().toISOString());
  this.raw.prepare('INSERT INTO calendar_event_recipients(event_id,actor_id) VALUES (?,?)').run(EVENT,NOA);
 }
 prepare(sql){const db=this.raw;return {bind(...params){const stmt=db.prepare(sql);return {
  async first(){return stmt.get(...params)||null;},
  async all(){return {results:stmt.all(...params)};},
  async run(){const res=stmt.run(...params);return {meta:{changes:res.changes}};}
 };}};}
 async batch(items){
  this.raw.exec('BEGIN');
  try{const r=[];for(const item of items)r.push(await item.run());this.raw.exec('COMMIT');return r;}
  catch(e){this.raw.exec('ROLLBACK');throw e;}
 }
}
async function setup(){
 const DB=new D1();
 DB.raw.prepare('INSERT INTO chat_admin_sessions VALUES (?,?,NULL)').run(await hash(TOKEN),Date.now()+60000);
 return {DB,V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'S'.repeat(48)};
}
async function api(env,path,{method='GET',token=TOKEN,payload,actorId=NOA}={}){
 const request=new Request(BASE+path,{method,headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},
 ...(payload?{body:JSON.stringify(payload)}:{})});
 const response=await handleRepertoireApi(request,env,new URL(request.url),'',
  (v,status=200)=>Response.json(v,{status}),
  async(_env,provided)=>provided==='musician'?{actorId}:null);
 return {status:response.status,data:await response.json()};
}
const SONG={title:'Some Song',artist:'Artist',category:'ENGLISH',position:0,referenceUrl:'https://youtube.com/watch?v=test',active:true};
const songs='/api/repertoire/admin/songs';
const items='/api/repertoire/admin/events/'+EVENT+'/items';
test('Anonymous and musician cannot read or write Admin Repertoire',async()=>{
 const env=await setup();
 assert.equal((await api(env,songs,{token:''})).status,401);
 assert.equal((await api(env,songs,{token:'musician'})).status,401);
 assert.equal((await api(env,songs,{token:'musician',method:'POST',payload:SONG})).status,401);
 assert.equal((await api(env,'/api/repertoire/songs',{token:''})).status,401);
});
test('Master songs: create, hide, version conflict and delete',async()=>{
 const env=await setup();
 const created=await api(env,songs,{method:'POST',payload:SONG});
 assert.equal(created.status,201,JSON.stringify(created.data));
 const id=created.data.song.id;
 assert.equal((await api(env,'/api/repertoire/songs',{token:'musician'})).data.songs.length,1);
 const modified={...SONG,title:'Updated',active:false,version:1};
 assert.equal((await api(env,songs+'/'+id,{method:'POST',payload:modified})).status,200);
 assert.equal((await api(env,'/api/repertoire/songs',{token:'musician'})).data.songs.length,0);
 assert.equal((await api(env,songs+'/'+id,{method:'DELETE',payload:{version:1}})).status,409);
 assert.equal((await api(env,songs+'/'+id,{method:'DELETE',payload:{version:2}})).status,200);
 assert.equal((await api(env,songs)).data.songs.length,0);
});
test('Event setlists are private; song snapshots survive master deletion',async()=>{
 const env=await setup();
 const song=await api(env,songs,{method:'POST',payload:SONG});
 const id=song.data.song.id;
 const add=await api(env,items,{method:'POST',payload:{songIds:[id]}});
 assert.equal(add.status,201,JSON.stringify(add.data));
 assert.equal(add.data.added,1);
 const path='/api/repertoire/events/'+EVENT+'/items';
 assert.equal((await api(env,path,{token:'musician',actorId:FER})).status,403);
 const assigned=await api(env,path,{token:'musician',actorId:NOA});
 assert.equal(assigned.status,200);
 assert.equal(assigned.data.items.length,1);
 assert.equal((await api(env,items,{method:'POST',payload:{songIds:[id]}})).data.added,0);
 assert.equal((await api(env,songs+'/'+id,{method:'DELETE',payload:{version:1}})).status,200);
 const copy=await api(env,path,{token:'musician'});
 assert.equal(copy.data.items[0].title,'Some Song');
 assert.equal(copy.data.items[0].songId,null);
});
test('Special, completion, reorder and removal are Admin only',async()=>{
 const env=await setup();
 const first=await api(env,items,{method:'POST',payload:{special:{title:'Special',artist:'Guest',referenceUrl:''}}});
 const second=await api(env,items,{method:'POST',payload:{special:{title:'Second',artist:'',referenceUrl:''}}});
 assert.equal(first.status,201);assert.equal(second.status,201,JSON.stringify(second.data));
 const ids=second.data.items.map(x=>x.id);
 assert.equal(ids.length,2);
 assert.equal((await api(env,'/api/repertoire/admin/items/'+ids[0],
  {method:'POST',payload:{completed:true},token:'musician'})).status,401);
 assert.equal((await api(env,'/api/repertoire/admin/items/'+ids[0],{method:'POST',payload:{completed:true}})).status,200);
 const reversed=await api(env,'/api/repertoire/admin/events/'+EVENT+'/order',
  {method:'POST',payload:{itemIds:[...ids].reverse()}});
 assert.equal(reversed.status,200,JSON.stringify(reversed.data));
 assert.equal(reversed.data.items[0].id,ids[1]);
 assert.equal((await api(env,'/api/repertoire/admin/events/'+EVENT+'/order',
  {method:'POST',payload:{itemIds:[ids[0]]}})).status,409);
 assert.equal((await api(env,'/api/repertoire/admin/items/'+ids[1],{method:'DELETE'})).status,200);
 assert.equal((await api(env,items)).data.items.length,1);
});
test('Malformed special payload returns a client error without modifying event list',async()=>{
 const env=await setup();
 for(const payload of [{special:'bad'}, {special:42}, {special:[]}, {special:null}]){
  const res=await api(env,items,{method:'POST',payload});
  assert.equal(res.status,400,JSON.stringify({payload,response:res.data}));
 }
 assert.equal((await api(env,items)).data.items.length,0);
});

test('Unassigned events remain private without affecting Chat or Calendar tables',async()=>{
 const env=await setup();
 assert.equal((await api(env,'/api/repertoire/events/'+EVENT+'/items',
  {token:'musician',actorId:FER})).status,403);
 assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS c FROM chat_members').get().c,2);
 assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS c FROM calendar_event_recipients').get().c,1);
});

test('Assigned-event bulk endpoint returns only musician own songs; never accepts actor spoofing',async()=>{
 const env=await setup();
 const first=await api(env,items,{method:'POST',payload:{
  special:{title:'Song for Noa',artist:'',referenceUrl:''}
 }});
 assert.equal(first.status,201,JSON.stringify(first.data));
 const mine=await api(env,'/api/repertoire/events/assigned',{token:'musician',actorId:NOA});
 assert.equal(mine.status,200);
 assert.equal(mine.data.items.length,1);
 assert.equal(mine.data.items[0].eventId,EVENT);
 const other=await api(env,'/api/repertoire/events/assigned?actorId='+NOA,{token:'musician',actorId:FER});
 assert.equal(other.status,200);
 assert.deepEqual(other.data.items,[]);
 assert.equal((await api(env,'/api/repertoire/events/assigned')).status,401);
 for(const offset of ['NaN','-1','10001','1.5']){
  assert.equal((await api(env,'/api/repertoire/events/assigned?offset='+offset,
   {token:'musician'})).status,400);
 }
 // Revoking the Calendar assignment immediately revokes its Repertoire list.
 env.DB.raw.prepare('DELETE FROM calendar_event_recipients WHERE event_id=? AND actor_id=?').run(EVENT,NOA);
 const revoked=await api(env,'/api/repertoire/events/assigned',{token:'musician',actorId:NOA});
 assert.equal(revoked.data.items.length,0);
});

test('Event Repertoire bulk pagination covers every assigned song without duplicates or cross-member leakage',async()=>{
 const env=await setup();
 const stmt=env.DB.raw.prepare(
  'INSERT INTO repertoire_event_items(id,event_id,song_id,title,artist,reference_url,position,created_at,updated_at)'+
  ' VALUES (?,?,?,?,?,?,?,?,?)');
 const now=new Date().toISOString();
 for(let i=0;i<252;i++){
  stmt.run(crypto.randomUUID(),EVENT,null,'Canción '+i,'Artista','',i,now,now);
 }
 const endpoint='/api/repertoire/events/assigned';
 const first=await api(env,endpoint,{token:'musician',actorId:NOA});
 const last=await api(env,endpoint+'?offset=250',{token:'musician',actorId:NOA});
 assert.equal(first.status,200);
 assert.equal(first.data.items.length,250);
 assert.equal(first.data.hasMore,true);
 assert.equal(last.status,200);
 assert.equal(last.data.items.length,2);
 assert.equal(last.data.hasMore,false);
 assert.equal(new Set([...first.data.items,...last.data.items].map(i=>i.id)).size,252);
 const other=await api(env,endpoint,{token:'musician',actorId:FER});
 assert.deepEqual(other.data.items,[]);
 assert.equal(other.data.hasMore,false);
});
