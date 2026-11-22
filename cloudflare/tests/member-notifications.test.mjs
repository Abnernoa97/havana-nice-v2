import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {notifyStoryOwner,notifyCalendarMembers,handleMemberNotices} from '../src/modules/notices/member-notifications.js';

const FER='member:fer',NOA='member:noa',STORY='123e4567-e89b-42d3-a456-426614174000';
const ROOT='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
function setup(){
 const raw=new DatabaseSync(':memory:');
 raw.exec('PRAGMA foreign_keys=ON');
 raw.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,active INTEGER NOT NULL)');
 raw.exec('CREATE TABLE member_stories(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,expires_at INTEGER NOT NULL)');
 raw.exec(readFileSync(new URL('../migrations/0034_member_notifications.sql',import.meta.url),'utf8'));
 raw.exec(readFileSync(new URL('../migrations/0037_calendar_member_notifications.sql',import.meta.url),'utf8'));
 raw.prepare('INSERT INTO chat_members VALUES(?,?,1)').run(FER,'Fer');
 raw.prepare('INSERT INTO chat_members VALUES(?,?,1)').run(NOA,'Noa');
 raw.prepare('INSERT INTO member_stories VALUES(?,?,?)').run(STORY,FER,Date.now()+86400000);
 const sql=(statement,params)=>({
  async first(){return raw.prepare(statement).get(...params)||null;},
  async all(){return {results:raw.prepare(statement).all(...params)};},
  async run(){return {meta:raw.prepare(statement).run(...params)};}
 });
 const DB={
  prepare:statement=>({bind:(...params)=>sql(statement,params)}),
  async batch(statements){
   raw.exec('BEGIN IMMEDIATE');
   try{
    const results=[];
    for(const statement of statements)results.push(await statement.run());
    raw.exec('COMMIT');
    return results;
   }catch(error){raw.exec('ROLLBACK');throw error;}
  }
 };
 const env={DB};
 const identity=(env,token)=>token==='fer'?{actorId:FER,displayName:'Fer'}:
  token==='noa'?{actorId:NOA,displayName:'Noa'}:null;
 const api=async(who,path='/api/notices',body=null)=>{
  const request=new Request(ROOT+path,{
   method:body?'POST':'GET',headers:{Authorization:'Bearer '+who},
   body:body?JSON.stringify(body):undefined
  });
  return handleMemberNotices(request,env,new URL(request.url),'',identity);
 };
 return {raw,env,api};
}

test('Only the owner of a photo receives the reaction; no group-wide broadcast',async()=>{
 const {env,api}=setup();
 const actor={actorId:NOA,displayName:'Noa'};
 assert.equal(await notifyStoryOwner(env,STORY,actor,'story.reaction',{
  emoji:'❤️',dedupeKey:'story.reaction:'+STORY+':'+NOA+':❤️'
 }),true);
 const fer=await (await api('fer')).json();
 assert.equal(fer.unread,1);
 assert.equal(fer.items.length,1);
 assert.equal(fer.items[0].name,'Noa');
 assert.equal(fer.items[0].emoji,'❤️');
 const noa=await (await api('noa')).json();
 assert.equal(noa.items.length,0);
});

test('Repeated hearts are deduplicated, but fresh comments have distinct notices',async()=>{
 const {env,api}=setup();
 const actor={actorId:NOA};
 for(let i=0;i<3;i++)await notifyStoryOwner(env,STORY,actor,'story.reaction',{
  emoji:'❤️',dedupeKey:'story.reaction:'+STORY+':'+NOA+':❤️'
 });
 await notifyStoryOwner(env,STORY,actor,'story.comment',{
  preview:'¡Me encanta!',dedupeKey:'story.comment:uuid1'
 });
 await notifyStoryOwner(env,STORY,actor,'story.comment',{
  preview:'Qué genial',dedupeKey:'story.comment:uuid2'
 });
 const fer=await (await api('fer')).json();
 assert.equal(fer.unread,3);
 assert.deepEqual(new Set(fer.items.map(x=>x.kind)),new Set(['story.reaction','story.comment']));
});

test('Reading notifications is restricted by recipient identity, never caller-provided actor',async()=>{
 const {env,api}=setup();
 await notifyStoryOwner(env,STORY,{actorId:NOA},'story.voice',{preview:'Nota de voz'});
 const first=await (await api('fer')).json();
 const id=first.items[0].id;
 assert.equal((await api('','/api/notices')).status,401);
 assert.equal((await api('noa','/api/notices/read',{id})).status,200);
 assert.equal((await (await api('fer')).json()).unread,1);
 assert.equal((await api('fer','/api/notices/read',{id})).status,200);
 const after=await (await api('fer')).json();
 assert.equal(after.unread,0);
 assert.ok(after.items[0].readAt);
 assert.equal((await api('fer','/api/notices/read',{id:'invalid'})).status,400);
});

test('Own activity, expired stories and revoked recipients never create an alert',async()=>{
 const {env,raw,api}=setup();
 assert.equal(await notifyStoryOwner(env,STORY,{actorId:FER},'story.comment'),false);
 raw.prepare('UPDATE member_stories SET expires_at=1 WHERE id=?').run(STORY);
 assert.equal(await notifyStoryOwner(env,STORY,{actorId:NOA},'story.comment'),false);
 raw.prepare('UPDATE member_stories SET expires_at=? WHERE id=?').run(Date.now()+60000,STORY);
 raw.prepare('UPDATE chat_members SET active=0 WHERE actor_id=?').run(FER);
 assert.equal(await notifyStoryOwner(env,STORY,{actorId:NOA},'story.comment'),false);
 assert.equal((await (await api('noa')).json()).unread,0);
});

test('Calendar changes create private system inbox notices, never impersonating a musician',async()=>{
 const {env,raw,api}=setup();
 const change={eventId:STORY,revision:'rev-1',action:'updated',
  title:'CUERNAVACA',date:'17 octubre 2026'};
 assert.equal(await notifyCalendarMembers(env,[FER,FER,NOA],change),2);
 assert.equal(await notifyCalendarMembers(env,[FER,NOA],change),0,
  'Retrying the same committed revision must not duplicate notifications');
 const fer=await (await api('fer')).json();
 const noa=await (await api('noa')).json();
 for(const inbox of [fer,noa]){
  assert.equal(inbox.unread,1);
  assert.equal(inbox.items.length,1);
  assert.equal(inbox.items[0].kind,'calendar.event');
  assert.equal(inbox.items[0].name,'HAVANA NICE');
  assert.equal(inbox.items[0].actorId,'');
  assert.match(inbox.items[0].preview,/CUERNAVACA/);
 }
 const id=fer.items[0].id;
 assert.equal((await api('noa','/api/notices/read',{id})).status,200);
 assert.equal((await (await api('fer')).json()).unread,1,'Other recipient cannot mark this notice as read');
 await api('fer','/api/notices/read',{id});
 assert.equal((await (await api('fer')).json()).unread,0);
 raw.prepare('UPDATE chat_members SET active=0 WHERE actor_id=?').run(NOA);
 assert.equal(await notifyCalendarMembers(env,[NOA],{...change,revision:'rev-2'}),0);
 assert.equal((await (await api('fer')).json()).items.length,1);
});
