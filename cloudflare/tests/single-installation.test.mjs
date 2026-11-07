import test from 'node:test';
import assert from 'node:assert/strict';
import {claimFirstInstallation,auditDuplicateInstallation,handleSingleInstallationAdmin} from '../src/single-installation.js';

const actor='member:test-one';
const user={actor_id:actor,display_name:'Prueba Uno'};
class FakeD1{
 constructor(){
   this.owner=new Map();this.sessions=new Map();this.alerts=[];
   this.member={actor_id:actor,display_name:'Prueba Uno'};
 }
 prepare(sql){
   return {
     all:async()=>this.all(sql,[]),
     bind:(...args)=>({
       first:async()=>this.first(sql,args),run:async()=>this.run(sql,args),
       all:async()=>this.all(sql,args),
       sql,args
     })
   };
 }
 async batch(statements){
   const first=statements[0],second=statements[1];
   if(first.sql.startsWith('INSERT OR IGNORE INTO chat_single_device_owners')){
     const [actorId,hash]=first.args;
     if(!this.owner.has(actorId))this.owner.set(actorId,hash);
     if(this.owner.get(second.args[4])===second.args[5]){
       this.sessions.set(second.args[0],{actorId:second.args[1]});
       return [{meta:{changes:1}},{meta:{changes:1}}];
     }
     return [{meta:{changes:0}},{meta:{changes:0}}];
   }
   if(first.sql.startsWith('DELETE FROM chat_sessions')){
     const before=this.sessions.size;
     this.sessions.clear();this.owner.delete(second.args[0]);
     return [{meta:{changes:before}},{meta:{changes:1}}];
   }
   throw Error('Unexpected DB batch '+first.sql);
 }
 async first(sql,args){
   if(sql.startsWith('SELECT expires_at,revoked_at FROM chat_admin_sessions'))
     return {expires_at:Date.now()+100000,revoked_at:null};
   if(sql.startsWith('SELECT actor_id,display_name FROM chat_members'))
     return args[0]===actor?this.member:null;
   throw Error('Unexpected D1 first '+sql);
 }
 async run(sql,args){
   if(sql.startsWith('DELETE FROM chat_sessions WHERE token_hash=?')){
     const [hash]=args;
     if([...this.owner.values()].includes(hash))return {meta:{changes:0}};
     return {meta:{changes:Number(this.sessions.delete(hash))}};
   }
   if(sql.startsWith('INSERT INTO chat_duplicate_login_alerts')){
     if(this.alerts.length>=20)return {meta:{changes:0}};
     this.alerts.push({id:args[0],actor_id:args[1],attempted_at:args[2],
       platform:args[3],operating_system:args[4],device_name:args[5],reviewed_at:null});
     return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE chat_duplicate_login_alerts')){
     const item=this.alerts.find(a=>a.id===args[1]);
     if(item&&!item.reviewed_at)item.reviewed_at=args[0];
     return {meta:{changes:item?1:0}};
   }
   throw Error('Unexpected D1 write '+sql);
 }
 async all(sql,args){
   if(sql.includes('FROM chat_duplicate_login_alerts a')){
     return {results:this.alerts.map(a=>({...a,display_name:user.display_name})).reverse()};
   }
   throw Error('Unexpected D1 all '+sql);
 }
}
const env=()=>{
 const delivered=[];
 return {DB:new FakeD1(),V2_ADMIN_LOGIN_MODE:'enabled',
  V2_ADMIN_LOGIN_SECRET:'x'.repeat(56),delivered,
  CHAT_ROOMS:{idFromName:n=>n,get:()=>({fetch:async(url,options)=>{
   delivered.push({url,payload:JSON.parse(options.body)});return Response.json({ok:true});
  }})}
 };
};
const json=(body,status=200)=>Response.json(body,{status});
const req=(method,path,body,token)=>new Request('https://worker.test'+path,{
 method,headers:{'Content-Type':'application/json',
 ...(token?{Authorization:'Bearer '+token}:{}),
 'user-agent':'Mozilla/5.0 (Linux; Android 10; K) Chrome/143 Mobile Safari'},
 body:body?JSON.stringify(body):undefined
});
const handler=(e,method,path,body,token)=>handleSingleInstallationAdmin(
 req(method,path,body,token),e,new URL('https://worker.test'+path),'',json);
const token='A'.repeat(56);

test('only the first competing installation gets a token; return visits keep original credential',async()=>{
 const e=env();
 const results=await Promise.all(Array.from({length:8},(_,i)=>
  claimFirstInstallation(e,user,('hash-'+i),Date.UTC(2100,0,1))));
 assert.equal(results.filter(Boolean).length,1);
 assert.equal(e.DB.sessions.size,1);
 assert.equal(e.DB.owner.size,1);
 const validOwner=e.DB.owner.get(actor);
 assert.equal(await claimFirstInstallation(e,user,validOwner,Date.UTC(2100,0,1)),true);
 assert.equal(e.DB.sessions.size,1);
});
test('a rejected name request writes privacy-minimal and bounded Admin alerts',async()=>{
 const e=env();
 for(let i=0;i<22;i++)await auditDuplicateInstallation(e,actor,req('POST','/api/chat/session',{displayName:'Prueba Uno'}));
 assert.equal(e.DB.alerts.length,20);
 assert.equal(e.delivered.length,20);
 assert.deepEqual(e.delivered[0].payload,{topic:'members'});
 assert.ok(!JSON.stringify(e.DB.alerts).includes('cf-connecting-ip'));
 assert.ok(!JSON.stringify(e.DB.alerts).includes('session.'));
 assert.ok(!JSON.stringify(e.DB.alerts).includes('hash-'));
});
test('the duplicate-alert inventory is private and does not expose login tokens',async()=>{
 const e=env();
 const unauthorized=await handler(e,'GET','/api/chat/admin/duplicate-logins');
 assert.equal(unauthorized.status,401);
 await auditDuplicateInstallation(e,actor,req('POST','/api/chat/session',{displayName:'Prueba Uno'}));
 const authorized=await handler(e,'GET','/api/chat/admin/duplicate-logins',undefined,token);
 assert.equal(authorized.status,200);
 const data=await authorized.json();
 assert.equal(data.alerts.length,1);
 assert.equal(data.alerts[0].display_name,'Prueba Uno');
 assert.equal(data.alerts[0].reviewed_at,null);
 assert.equal(Object.keys(data.alerts[0]).includes('token_hash'),false);
});
test('only the Administrator can review duplicate warnings or release a single installation',async()=>{
 const e=env();
 await claimFirstInstallation(e,user,'owner-hash',Date.UTC(2100,0,1));
 assert.equal((await handler(e,'POST','/api/chat/admin/release-installation',
   {actorId:actor,confirmName:'Prueba Uno'})).status,401);
 assert.equal(e.DB.owner.size,1);
 assert.equal((await handler(e,'POST','/api/chat/admin/release-installation',
   {actorId:actor,confirmName:'Someone Else'},token)).status,409);
 assert.equal(e.DB.owner.size,1);
 const released=await handler(e,'POST','/api/chat/admin/release-installation',
   {actorId:actor,confirmName:'Prueba Uno'},token);
 assert.equal(released.status,200);
 assert.equal((await released.json()).revokedSessions,1);
 assert.equal(e.DB.owner.size,0);
 assert.equal(e.DB.sessions.size,0);
 assert.equal(e.DB.member.display_name,'Prueba Uno','release must preserve membership');
 assert.deepEqual(e.delivered.filter(x=>x.url.includes('installation-released')).length,1);
});
test('reviewing one alert does not delete the alert or its audit trail',async()=>{
 const e=env();
 await auditDuplicateInstallation(e,actor,req('POST','/api/chat/session',{displayName:'Prueba Uno'}));
 const id=e.DB.alerts[0].id;
 const reviewed=await handler(e,'POST','/api/chat/admin/duplicate-logins/review',{id},token);
 assert.equal(reviewed.status,200);
 assert.equal(e.DB.alerts.length,1);
 assert.ok(e.DB.alerts[0].reviewed_at>0);
});

test('Admin release permits replacement without reviving the former session',async()=>{
 const e=env();
 await claimFirstInstallation(e,user,'first-owner',Date.UTC(2100,0,1));
 await handler(e,'POST','/api/chat/admin/release-installation',
   {actorId:actor,confirmName:'Prueba Uno'},token);
 assert.equal(e.DB.owner.size,0);
 assert.equal(e.DB.sessions.has('first-owner'),false);
 assert.equal(await claimFirstInstallation(e,user,'replacement-owner',Date.UTC(2100,0,1)),true);
 assert.equal(await claimFirstInstallation(e,user,'first-owner',Date.UTC(2100,0,1)),false);
 assert.equal(e.DB.owner.get(actor),'replacement-owner');
 assert.equal(e.DB.sessions.size,1);
});
