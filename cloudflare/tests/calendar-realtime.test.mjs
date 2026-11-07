import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {calendarSocketIdentity,calendarSocketAuthorized,CalendarRoom,notifyCalendarClients} from '../src/calendar-realtime.js';
import {sha256Hex} from '../src/crypto-helpers.js';

const M1='member:123e4567-e89b-42d3-a456-426614174001';
const M2='member:123e4567-e89b-42d3-a456-426614174002';
const EXPIRES=Date.now()+60000;
const MEMBER_TOKEN='A'.repeat(43);
const ADMIN_TOKEN='B'.repeat(43);
async function environment(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,active INTEGER);'+
  'CREATE TABLE chat_sessions(actor_id TEXT,token_hash TEXT,expires_at INTEGER);'+
  'CREATE TABLE chat_single_device_owners(actor_id TEXT,token_hash TEXT);'+
  'CREATE TABLE chat_admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER,revoked_at INTEGER);');
 for(const actorId of [M1,M2])
  db.prepare('INSERT INTO chat_members VALUES(?,1)').run(actorId);
 const memberHash=await sha256Hex(MEMBER_TOKEN);
 db.prepare('INSERT INTO chat_sessions VALUES(?,?,?)').run(M1,memberHash,EXPIRES);
 db.prepare('INSERT INTO chat_single_device_owners VALUES(?,?)').run(M1,memberHash);
 db.prepare('INSERT INTO chat_admin_sessions VALUES(?,?,NULL)').run(await sha256Hex(ADMIN_TOKEN),EXPIRES);
 const DB={prepare(sql){return {bind(...args){return {
  async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};}
 };}}}};
 return {raw:db,env:{DB,V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'S'.repeat(48)}};
}
test('Calendar websocket requires exactly one authenticated role in protocol, not URL',async()=>{
 const {env,raw}=await environment();
 const id=(...protocols)=>calendarSocketIdentity(
  new Request('https://internal/ws/calendar',{headers:{'sec-websocket-protocol':protocols.join(', ')}}));
 assert.equal(id('havana-v2-calendar'),null);
 assert.equal(id('session.'+MEMBER_TOKEN),null);
 assert.equal(id('havana-v2-calendar','session.'+MEMBER_TOKEN,'admin.'+ADMIN_TOKEN),null);
 assert.deepEqual(await calendarSocketAuthorized(env,id('havana-v2-calendar','session.'+MEMBER_TOKEN)),
  {role:'member',actorId:M1});
 assert.deepEqual(await calendarSocketAuthorized(env,id('havana-v2-calendar','admin.'+ADMIN_TOKEN)),
  {role:'admin',actorId:null});
 raw.prepare('UPDATE chat_members SET active=0 WHERE actor_id=?').run(M1);
 assert.equal(await calendarSocketAuthorized(env,id('havana-v2-calendar','session.'+MEMBER_TOKEN)),null);
 raw.close();
});
test('invalidation only reaches involved authorized members and Admin, never event content',async()=>{
 const {env,raw}=await environment();
 const published=[];
 env.CALENDAR_ROOMS={
  idFromName(name){assert.equal(name,'calendar-v2');return name;},
  get(){return {async fetch(_url,options){published.push(JSON.parse(options.body));return Response.json({ok:true});}}}
 };
 await notifyCalendarClients(env,[M1,M1,M2,'bad']);
 assert.deepEqual(published,[{recipients:[M1,M2]}]);
 const room=new CalendarRoom({},env);
 assert.equal(Object.hasOwn(room,'state'),false,'Durable Object does not store unused state');
 const received={noa:[],admin:[],stranger:[]};
 // The room delivers only type hints; details are fetched privately from D1.
 const fake=(messages)=>({readyState:1,send(s){messages.push(JSON.parse(s));},close(){}});
 room.connections.set(fake(received.noa),{role:'member',actorId:M1,identity:{role:'member',token:MEMBER_TOKEN}});
 room.connections.set(fake(received.admin),{role:'admin',actorId:null,identity:{role:'admin',token:ADMIN_TOKEN}});
 room.connections.set(fake(received.stranger),{role:'member',actorId:M2,identity:{role:'member',token:'C'.repeat(43)}});
 const oldWebSocket=globalThis.WebSocket;
 globalThis.WebSocket={OPEN:1};
 try{
  const reply=await room.fetch(new Request('https://internal/calendar-changed',{method:'POST',
   body:JSON.stringify({recipients:[M1]})}));
  assert.equal(reply.status,200);
  assert.deepEqual(received.noa,[{type:'calendar.invalidate'}]);
  assert.deepEqual(received.admin,[{type:'calendar.invalidate'}]);
  assert.deepEqual(received.stranger,[]);
 }finally{globalThis.WebSocket=oldWebSocket;raw.close();}
});

test('one canonical SHA-256 helper preserves hashed credentials and grants',async()=>{
 assert.equal(await sha256Hex('abc'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal((await sha256Hex(MEMBER_TOKEN)).length,64);
});
