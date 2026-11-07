import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {handleCalendarApi} from '../src/calendar.js';

const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const TOKEN='A'.repeat(43);
const M1='member:123e4567-e89b-42d3-a456-426614174001';
const M2='member:123e4567-e89b-42d3-a456-426614174002';
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
class DB{
 constructor(){
  this.raw=new DatabaseSync(':memory:');
  this.raw.exec('PRAGMA foreign_keys=ON;CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT,active INTEGER);'+
   'CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER);');
  const migration=readFileSync(new URL('../migrations/0018_calendar_events.sql',import.meta.url),'utf8');
  assert.doesNotMatch(migration,/DROP TABLE|ALTER TABLE chat_|DELETE FROM chat_/i);
  this.raw.exec(migration);
  this.raw.exec(readFileSync(new URL('../migrations/0019_calendar_free_text.sql',import.meta.url),'utf8'));
  for(const [id,name] of [[M1,'Noa'],[M2,'Fer']])this.raw.prepare('INSERT INTO chat_members VALUES (?,?,1)').run(id,name);
 }
 prepare(sql){
  const db=this.raw;
  return {bind(...args){
   const stmt=db.prepare(sql);
   return {
    async first(){return stmt.get(...args)||null;},
    async all(){return {results:stmt.all(...args)};},
    async run(){const r=stmt.run(...args);return {meta:{changes:r.changes}};}
   };
  }};
 }
 async batch(items){
  this.raw.exec('BEGIN IMMEDIATE');
  try{
   const out=[];
   for(const item of items)out.push(await item.run());
   this.raw.exec('COMMIT');
   return out;
  }catch(error){this.raw.exec('ROLLBACK');throw error;}
 }
}
async function env(){
 const database=new DB();
 database.raw.prepare('INSERT INTO chat_admin_sessions VALUES (?,?,NULL)').run(await hash(TOKEN),Date.now()+60_000);
 return {DB:database,V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'S'.repeat(48)};
}
const sample={date:'2026-11-28',timeZone:'America/Mexico_City',title:'Boda de prueba',venue:'Lugar',
 city:'Ciudad',callTime:'1:00 p.m.',soundcheckTime:'Por definir',arrivalTime:'',showTime:'7:00 p.m.',
 endTime:'',wardrobe:'Traje negro',details:'Prueba',contactName:'Planner',contactPhone:'+52 55 1111',
 notes:'Equipo',mapUrl:'https://maps.google.com/?q=Mexico',status:'confirmed',statusText:'',recipientIds:[M1]};
async function request(env,path,{method='GET',token=TOKEN,body,actorId=M1}={}){
 const req=new Request(BASE+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
 ...(body?{body:JSON.stringify(body)}:{})});
 const response=await handleCalendarApi(req,env,new URL(req.url),'',
  (data,status=200)=>Response.json(data,{status}),
  async(_env,provided)=>provided==='musician'?{actorId}:null);
 return {status:response.status,data:await response.json()};
}
test('no anonymous access; a musician cannot create or list Admin dates',async()=>{
 const e=await env();
 assert.equal((await request(e,'/api/calendar/events',{token:''})).status,401);
 assert.equal((await request(e,'/api/calendar/admin/events',{token:'musician'})).status,401);
 assert.equal((await request(e,'/api/calendar/admin/events',{method:'POST',token:'musician',body:sample})).status,401);
});
test('Admin sends one date to Noa only, including flexible original time and map fields',async()=>{
 const e=await env();
 const saved=await request(e,'/api/calendar/admin/events',{method:'POST',body:sample});
 assert.equal(saved.status,201);
 const noa=await request(e,'/api/calendar/events',{token:'musician'});
 const fer=await request(e,'/api/calendar/events',{token:'musician',actorId:M2});
 assert.equal(noa.data.events.length,1);
 assert.equal(noa.data.events[0].soundcheckTime,'Por definir');
 assert.equal(noa.data.events[0].mapUrl,sample.mapUrl);
 assert.equal(fer.data.events.length,0);
 assert.equal(fer.data.events[0]?.recipientIds,undefined);
 const admin=await request(e,'/api/calendar/admin/events');
 assert.deepEqual(admin.data.events[0].recipientIds,[M1]);
});
test('Admin changes recipients atomically, stale versions never overwrite',async()=>{
 const e=await env();
 const created=await request(e,'/api/calendar/admin/events',{method:'POST',body:sample});
 const id=created.data.event.id;
 const changed=await request(e,'/api/calendar/admin/events/'+id,{method:'POST',body:{...sample,version:1,title:'Cambio',recipientIds:[M2]}});
 assert.equal(changed.status,200);
 assert.equal(changed.data.event.version,2);
 const stale=await request(e,'/api/calendar/admin/events/'+id,{method:'POST',body:{...sample,version:1,recipientIds:[M1]}});
 assert.equal(stale.status,409);
 const noa=await request(e,'/api/calendar/events',{token:'musician'});
 const fer=await request(e,'/api/calendar/events',{token:'musician',actorId:M2});
 assert.equal(noa.data.events.length,0);
 assert.equal(fer.data.events.length,1);
 assert.equal(fer.data.events[0].title,'Cambio');
});
test('reject unassigned, spoofed or inactive recipients while allowing arbitrary text fields',async()=>{
 const e=await env();
 for(const change of [{recipientIds:[]},{recipientIds:['123e4567-e89b-42d3-a456-426614174099']},{recipientIds:['member:123e4567-e89b-42d3-a456-426614174099']}]) {
  const res=await request(e,'/api/calendar/admin/events',{method:'POST',body:{...sample,...change}});
  assert.equal(res.status,400);
 }
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n,0);
});
test('Admin delete removes event and recipients, preserving Chat-related tables',async()=>{
 const e=await env();
 const created=await request(e,'/api/calendar/admin/events',{method:'POST',body:sample});
 const id=created.data.event.id;
 assert.equal((await request(e,'/api/calendar/admin/events/'+id,{method:'DELETE',body:{version:1}})).status,200);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n,0);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM calendar_event_recipients').get().n,0);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM chat_members').get().n,2);
});

test('freeform date, punctuation, custom status and non-URL map text are preserved',async()=>{
 const e=await env();
 const flexible={...sample,date:'14/11/2026',statusText:'¡CONFIRMADO! #2026',
  callTime:'12? ∞ @ 1:30 p. m.',venue:'CDMX / Piso #3 & Más',mapUrl:'Mapa: calle 20 #35',
  contactPhone:'+52 (55) ## / extensión X',notes:'Se permiten símbolos: ! ? / # @ &'};
 const result=await request(e,'/api/calendar/admin/events',{method:'POST',body:flexible});
 assert.equal(result.status,201,JSON.stringify(result.data));
 const stored=e.DB.raw.prepare('SELECT event_date,date_sort,status_text,map_url FROM calendar_events').get();
 assert.deepEqual({...stored},{event_date:'14/11/2026',date_sort:'2026-11-14',
  status_text:'¡CONFIRMADO! #2026',map_url:'Mapa: calle 20 #35'});
 const read=await request(e,'/api/calendar/events',{token:'musician'});
 assert.equal(read.data.events[0].statusText,flexible.statusText);
 assert.equal(read.data.events[0].contactPhone,flexible.contactPhone);
});
test('full lifecycle: Admin creates date for three musicians, edits assignment and then deletes safely',async()=>{
 const e=await env();
 const third='member:123e4567-e89b-42d3-a456-426614174003';
 e.DB.raw.prepare('INSERT INTO chat_members VALUES (?,?,1)').run(third,'Andy');
 const event={...sample,date:'14dic26',title:'Prueba de acordeón',
  recipientIds:[M1,M2,third],statusText:'LISTO #14'};
 const created=await request(e,'/api/calendar/admin/events',{method:'POST',body:event});
 assert.equal(created.status,201,JSON.stringify(created.data));
 const id=created.data.event.id;
 for(const actorId of [M1,M2,third]){
  const memberView=await request(e,'/api/calendar/events',{token:'musician',actorId});
  assert.equal(memberView.data.events.length,1);
  assert.equal(memberView.data.events[0].date,'14dic26');
  assert.equal(memberView.data.events[0].statusText,'LISTO #14');
  assert.equal('recipientIds' in memberView.data.events[0],false);
 }
 const revised=await request(e,'/api/calendar/admin/events/'+id,{
  method:'POST',body:{...event,version:1,title:'Acordeón actualizado',recipientIds:[M2]}
 });
 assert.equal(revised.status,200);
 assert.equal(revised.data.event.version,2);
 assert.equal((await request(e,'/api/calendar/events',{token:'musician',actorId:M1})).data.events.length,0);
 assert.equal((await request(e,'/api/calendar/events',{token:'musician',actorId:third})).data.events.length,0);
 assert.equal((await request(e,'/api/calendar/events',{token:'musician',actorId:M2})).data.events[0].title,'Acordeón actualizado');
 const rejectStaleDelete=await request(e,'/api/calendar/admin/events/'+id,{method:'DELETE',body:{version:1}});
 assert.equal(rejectStaleDelete.status,409);
 assert.equal((await request(e,'/api/calendar/events',{token:'musician',actorId:M2})).data.events.length,1);
 assert.equal((await request(e,'/api/calendar/admin/events/'+id,{method:'DELETE',body:{version:2}})).status,200);
 for(const actorId of [M1,M2,third]){
  assert.equal((await request(e,'/api/calendar/events',{token:'musician',actorId})).data.events.length,0);
 }
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM calendar_event_recipients').get().n,0);
 assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM chat_members').get().n,3);
});

test('unrecognized dates remain valid free text and are displayed after dated events',async()=>{
 const e=await env();
 const created=await request(e,'/api/calendar/admin/events',{method:'POST',body:{...sample,date:'Por confirmar / ???'}});
 assert.equal(created.status,201);
 const row=e.DB.raw.prepare('SELECT event_date,date_sort FROM calendar_events').get();
 assert.equal(row.event_date,'Por confirmar / ???');
 assert.equal(row.date_sort,null);
});


test('Realtime Calendar signals only previous/new musicians plus Admin after committed CRUD',async()=>{
 const e=await env();
 const messages=[];
 e.CALENDAR_ROOMS={
  idFromName(name){assert.equal(name,'calendar-v2');return name;},
  get(){return {async fetch(_url,init){
   const data=JSON.parse(init.body);
   messages.push(data.recipients);
   return Response.json({ok:true});
  }};}
 };
 const created=await request(e,'/api/calendar/admin/events',{method:'POST',body:sample});
 assert.equal(created.status,201);
 assert.deepEqual(messages.shift(),[M1]);
 const id=created.data.event.id;
 const updated=await request(e,'/api/calendar/admin/events/'+id,{
  method:'POST',body:{...sample,title:'Cambio en vivo',recipientIds:[M2],version:1}});
 assert.equal(updated.status,200);
 assert.deepEqual(messages.shift(),[M1,M2]);
 assert.equal((await request(e,'/api/calendar/events',{token:'musician',actorId:M1})).data.events.length,0);
 assert.equal((await request(e,'/api/calendar/events',{token:'musician',actorId:M2})).data.events[0].title,'Cambio en vivo');
 const stale=await request(e,'/api/calendar/admin/events/'+id,{
  method:'DELETE',body:{version:1}});
 assert.equal(stale.status,409);
 assert.equal(messages.length,0,'A rejected write must never publish an invalidation');
 const deleted=await request(e,'/api/calendar/admin/events/'+id,{
  method:'DELETE',body:{version:2}});
 assert.equal(deleted.status,200);
 assert.deepEqual(messages.shift(),[M2]);
 assert.equal(messages.length,0);
});
