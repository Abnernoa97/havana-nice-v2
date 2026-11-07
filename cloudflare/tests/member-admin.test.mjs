import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAdminMemberManagement,readMemberDevice,recordMemberEvent} from '../src/member-admin.js';

const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const token='Q'.repeat(43),actor='member:orly';
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
class FakeDB{
 constructor(){this.members=new Map([[actor,{actor_id:actor,display_name:'Orly'}]]);this.statements=[];this.sessionHash='';this.revoked=false;}
 prepare(sql){
  return {bind:(...args)=>({
    first:async()=>{
      if(sql.startsWith('SELECT expires_at,revoked_at'))return args[0]===this.sessionHash?{expires_at:Date.now()+60_000,revoked_at:this.revoked?Date.now():null}:null;
      if(sql.startsWith('SELECT actor_id,display_name FROM chat_members'))return this.members.get(args[0])||null;
      if(sql.startsWith('SELECT actor_id FROM chat_members'))return this.members.get(args[0])||null;
      if(sql.startsWith('SELECT COUNT(*) AS entries'))return {entries:2};
      if(sql.includes('AS historyEvents'))return {sessions:2,messages:3,reactions:1,receipts:1,historyEvents:4};

      throw Error('Unexpected first: '+sql);
    },
    all:async()=>{
      if(sql.startsWith('SELECT event_type,occurred_at'))return {results:[]};
      throw Error('Unexpected all: '+sql);
    },
    run:async()=>{
      if(sql.startsWith('INSERT INTO chat_access_events')&&!this.members.has(args[8]))return {meta:{changes:0}};
      this.statements.push({sql,args});return {meta:{changes:1}};
    },
    sql,args
  })};
 }
 async batch(queries){
   return queries.map(({sql,args})=>{
     this.statements.push({sql,args});
     if(sql.startsWith('DELETE FROM chat_members'))this.members.delete(args[0]);
     return {meta:{changes:1}};
   });
 }
}
async function env(){
 const DB=new FakeDB();
 DB.sessionHash=await digest(token);
 const events=[];
 return {DB,events,V2_ADMIN_LOGIN_MODE:'enabled',V2_ADMIN_LOGIN_SECRET:'S'.repeat(48),
 CHAT_ROOMS:{idFromName:x=>x,get:()=>({fetch:async(path,options)=>{events.push({path,body:options?.body});return Response.json({ok:true});}})}};
}
const handler=async(e,method,path,body,authorized=true)=>{
 const req=new Request(BASE+path,{method,
  headers:{...(authorized?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined});
 const result=await handleAdminMemberManagement(req,e,new URL(req.url),'', (body,status=200)=>Response.json(body,{status}),'main-chat-v2');
 return {status:result.status,body:await result.json()};
};
test('access history extracts only grounded UA device data',()=>{
 const samsung=readMemberDevice(new Request(BASE,{headers:{origin:'https://havana-nice-v2-dev.pages.dev',
  'user-agent':'Mozilla/5.0 (Linux; Android 14; SM-S928B Build/UP1A) AppleWebKit/537.36'}}));
 assert.match(samsung.operatingSystem,/Android 14/);
 assert.equal(samsung.deviceName,'Teléfono Android');
 assert.equal(samsung.model,'SM-S928B');
 assert.equal(samsung.platform,'PWA');
 const iphone=readMemberDevice(new Request(BASE,{headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'}}));
 assert.equal(iphone.deviceName,'iPhone');
 assert.equal(iphone.model,null);
 assert.match(iphone.operatingSystem,/iOS 17\.5/);
});
test('successful named login writes a date-bearing record without raw UA or IP',async()=>{
 const e=await env();
 const request=new Request(BASE,{headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'}});
 await recordMemberEvent(e,actor,'login',request);
 assert.equal(e.DB.statements.length,1);
 const item=e.DB.statements[0];
 assert.match(item.sql,/INSERT INTO chat_access_events/);
 assert.match(item.sql,/WHERE EXISTS \(SELECT 1 FROM chat_members/);
 assert.equal(item.args[1],actor);assert.equal(item.args[2],'login');
 assert.equal(typeof item.args[3],'number');
 assert.equal(item.args[7],null);
});
test('anonymous clients cannot read or delete member history',async()=>{
 const e=await env();
 const a=await handler(e,'GET','/api/chat/admin/member-history?actorId=member%3Aorly',null,false);
 const b=await handler(e,'POST','/api/chat/admin/remove-member',{actorId:actor,confirmName:'Orly'},false);
 assert.equal(a.status,401);assert.equal(b.status,401);
 assert.equal(e.DB.members.size,1);assert.equal(e.DB.statements.length,0);
});
test('history reflects actual database entry count, never invented metadata',async()=>{
 const e=await env();
 const r=await handler(e,'GET','/api/chat/admin/member-history?actorId=member%3Aorly');
 assert.equal(r.status,200);assert.equal(r.body.entries,2);
 assert.deepEqual(r.body.events,[]);
 assert.match(r.body.since,/no se inventan/);
});
test('permanent deletion requires the exact target member name',async()=>{
 const e=await env();
 const r=await handler(e,'POST','/api/chat/admin/remove-member',{actorId:actor,confirmName:'Andy'});
 assert.equal(r.status,409);assert.equal(e.DB.members.size,1);assert.equal(e.DB.statements.length,0);
});
test('atomic permanent deletion clears all musician-owned D1 tables then expels Chat sockets',async()=>{
 const e=await env();
 const result=await handler(e,'POST','/api/chat/admin/remove-member',{actorId:actor,confirmName:'Orly'});
 assert.equal(result.status,200);assert.equal(result.body.deleted,true);
 assert.equal(e.DB.members.size,0);
 const queries=e.DB.statements.map(x=>x.sql).join('\n');
 for(const term of ['UPDATE chat_messages SET reply_to_seq=NULL','DELETE FROM chat_reactions WHERE message_seq',
  'DELETE FROM chat_reactions WHERE actor_id','DELETE FROM chat_messages WHERE sender_id',
  'DELETE FROM chat_read_receipts','DELETE FROM chat_sessions',
  'DELETE FROM chat_access_events','DELETE FROM chat_members']){
   assert.ok(queries.includes(term),'Missing cleanup '+term);
 }
 assert.deepEqual(e.events.map(x=>new URL(x.path).pathname),['/member-removed','/admin-invalidate']);
 assert.equal(JSON.parse(e.events[0].body).actorId,actor);
});

test('confirmed member removal stays successful when Durable Object notifications fail',async()=>{
 const e=await env();
 e.CHAT_ROOMS.get=()=>({fetch:async()=>{throw new Error('Realtime temporarily unavailable');}});
 const result=await handler(e,'POST','/api/chat/admin/remove-member',{actorId:actor,confirmName:'Orly'});
 assert.equal(result.status,200);
 assert.equal(result.body.deleted,true);
 assert.equal(e.DB.members.size,0,'D1 deletion is authoritative and cannot be undone by notification outage');
});

test('revoked Administrator credentials cannot read member history or delete an account',async()=>{
 const e=await env();
 e.DB.revoked=true;
 const history=await handler(e,'GET','/api/chat/admin/member-history?actorId='+encodeURIComponent(actor));
 const deletion=await handler(e,'POST','/api/chat/admin/remove-member',{actorId:actor,confirmName:'Orly'});
 assert.equal(history.status,401);
 assert.equal(deletion.status,401);
 assert.equal(e.DB.members.size,1);
 assert.equal(e.DB.statements.length,0);
});

test('after account deletion, stale device event writes cannot recreate its history',async()=>{
 const e=await env();
 const result=await handler(e,'POST','/api/chat/admin/remove-member',{actorId:actor,confirmName:'Orly'});
 assert.equal(result.status,200);
 const before=e.DB.statements.length;
 await recordMemberEvent(e,actor,'connect',new Request(BASE));
 await recordMemberEvent(e,actor,'disconnect',new Request(BASE));
 assert.equal(e.DB.statements.length,before,'No activity may resurrect a deleted member history');
 const history=await handler(e,'GET','/api/chat/admin/member-history?actorId='+encodeURIComponent(actor));
 const retry=await handler(e,'POST','/api/chat/admin/remove-member',{actorId:actor,confirmName:'Orly'});
 assert.equal(history.status,404);
 assert.equal(retry.status,404);
});

test('access history does not fabricate device model when identification is unavailable',()=>{
 const req=new Request(BASE,{headers:{'user-agent':'Mozilla/5.0 Chrome/131.0.0.0'}});
 const meta=readMemberDevice(req);
 assert.equal(meta.operatingSystem,'No identificado');
 assert.equal(meta.deviceName,'Dispositivo no identificado');
 assert.equal(meta.model,null);
 assert.equal(meta.platform,'Cliente no identificado');
});

test('reduced Chromium Android UA does not report false OS version or model',()=>{
 const reduced=readMemberDevice(new Request(BASE,{headers:{
  'user-agent':'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36',
  origin:'https://havana-nice-v2-dev.pages.dev'
 }}));
 assert.equal(reduced.operatingSystem,'Android (versión no disponible)');
 assert.equal(reduced.model,null);
 assert.equal(reduced.deviceName,'Teléfono Android');
});

test('member delete preview requires Admin auth and never mutates data',async()=>{
 const e=await env();
 const path='/api/chat/admin/member-delete-preview?actorId='+encodeURIComponent(actor);
 const denied=await handler(e,'GET',path,null,false);
 assert.equal(denied.status,401);
 const result=await handler(e,'GET',path);
 assert.equal(result.status,200);
 assert.equal(result.body.displayName,'Orly');
 assert.equal(result.body.canDelete,true);
 assert.deepEqual(result.body.counts,{
  sessions:2,messages:3,reactions:1,receipts:1,historyEvents:4
 });
 assert.equal(e.DB.statements.length,0);
 assert.equal(e.DB.members.size,1);
});

test('member deletion preview rejects invalid or absent members',async()=>{
 const e=await env();
 const invalid=await handler(e,'GET','/api/chat/admin/member-delete-preview?actorId=bad');
 const missing=await handler(e,'GET','/api/chat/admin/member-delete-preview?actorId=member%3Aabsent');
 assert.equal(invalid.status,400);
 assert.equal(missing.status,404);
 assert.equal(e.DB.statements.length,0);
});
