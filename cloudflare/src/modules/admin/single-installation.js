// HAVANA NICE V2 — single installation per Admin-created musician name.
// Every member uses one installation. The installation credential is the
// issued Chat session; never compare User-Agent, IP or WebSocket presence.
import {verifyAdminSession} from './admin-auth.js';
import {notifyAdminClients} from './admin-realtime.js';
import {readMemberDevice} from './member-admin.js';
const ID=/^member:[a-z0-9_-]{1,40}$/i;
const ROOM='main-chat-v2';
function reply(respond,origin,body,status=200){return respond(body,status,origin);}
export async function claimFirstInstallation(env,member,tokenHash,expiry){
 // D1 batch is a single transaction. Only one token wins across concurrent
 // new-device requests for a given musician; loser gets NO session.
 const rows=await env.DB.batch([
   env.DB.prepare(
     'INSERT OR IGNORE INTO chat_single_device_owners(actor_id,token_hash,linked_at) VALUES(?,?,?)'
   ).bind(member.actor_id,tokenHash,Date.now()),
   env.DB.prepare(
     'INSERT INTO chat_sessions(token_hash,actor_id,display_name,expires_at) '+
     'SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM chat_single_device_owners WHERE actor_id=? AND token_hash=?)'
   ).bind(tokenHash,member.actor_id,member.display_name,expiry,member.actor_id,tokenHash)
 ]);
 return Number(rows[1]?.meta?.changes)===1;
}
export async function auditDuplicateInstallation(env,actorId,request){
 // Bounded per account to avoid an unbounded audit table from guessed names.
 try{
   const meta=readMemberDevice(request),now=Date.now();
   const r=await env.DB.prepare(
     'INSERT INTO chat_duplicate_login_alerts(id,actor_id,attempted_at,platform,operating_system,device_name) '+
     'SELECT ?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM chat_duplicate_login_alerts '+
     'WHERE actor_id=? AND attempted_at>?)<20'
   ).bind(crypto.randomUUID(),actorId,now,meta.platform,meta.operatingSystem,meta.deviceName,
     actorId,now-86400000).run();
   if(Number(r.meta?.changes)>0)await notifyAdminClients(env,'members');
 }catch{/* Denial always wins even when alert storage or realtime is down. */}
}
export async function handleSingleInstallationAdmin(request,env,url,origin,respond){
 if(!await verifyAdminSession(request,env))
   return reply(respond,origin,{error:'No autorizado'},401);
 if(url.pathname==='/api/chat/admin/duplicate-logins'&&request.method==='GET'){
   const result=await env.DB.prepare(
     'SELECT a.id,a.actor_id,m.display_name,a.attempted_at,a.platform,a.operating_system,'+
     'a.device_name,a.reviewed_at FROM chat_duplicate_login_alerts a '+
     'JOIN chat_members m ON m.actor_id=a.actor_id '+
     'ORDER BY a.attempted_at DESC LIMIT 60'
   ).all();
   return reply(respond,origin,{alerts:result.results||[]});
 }
 if(url.pathname==='/api/chat/admin/duplicate-logins/review'&&request.method==='POST'){
   let body=null;try{body=await request.json();}catch{}
   if(typeof body?.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))
     return reply(respond,origin,{error:'Alerta inválida'},400);
   await env.DB.prepare(
     'UPDATE chat_duplicate_login_alerts SET reviewed_at=? WHERE id=? AND reviewed_at IS NULL'
   ).bind(Date.now(),body.id).run();
   await notifyAdminClients(env,'members');
   return reply(respond,origin,{ok:true});
 }
 if(url.pathname==='/api/chat/admin/release-installation'&&request.method==='POST'){
   let body=null;try{body=await request.json();}catch{}
   if(typeof body?.actorId!=='string'||!ID.test(body.actorId)||
      typeof body?.confirmName!=='string')
     return reply(respond,origin,{error:'Confirmación inválida'},400);
   const m=await env.DB.prepare(
     'SELECT actor_id,display_name FROM chat_members WHERE actor_id=? AND active=1'
   ).bind(body.actorId).first();
   if(!m)return reply(respond,origin,{error:'Miembro no encontrado'},404);
   if(m.display_name!==body.confirmName)
     return reply(respond,origin,{error:'El nombre de confirmación no coincide'},409);
   // The member, its messages, and access history are NEVER deleted by release.
   // Invalidate all of this member's credentials before clearing the owner
   // record; on next login the first claimant becomes the new sole owner.
   const rows=await env.DB.batch([
     env.DB.prepare('DELETE FROM chat_sessions WHERE actor_id=?').bind(body.actorId),
     env.DB.prepare('DELETE FROM chat_single_device_owners WHERE actor_id=?').bind(body.actorId)
   ]);
   try{
     await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM)).fetch(
       'https://internal/installation-released',
       {method:'POST',body:JSON.stringify({actorId:body.actorId})}
     );
   }catch{/* Next request checks D1. DB removal stays authoritative. */}
   await notifyAdminClients(env,'members');
   return reply(respond,origin,{ok:true,revokedSessions:Number(rows[0]?.meta?.changes||0)});
 }
 return reply(respond,origin,{error:'Ruta no válida'},404);
}
