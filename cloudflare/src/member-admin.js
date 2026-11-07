// HAVANA NICE V2 — Administrator-controlled musician access history and
// irreversible database removal. No raw UA/IP, passwords or tokens in audit.
import {verifyAdminSession} from './admin-auth.js';
import {notifyAdminClients} from './admin-realtime.js';

const ID=/^member:(?:[a-z0-9_-]{1,28}|[0-9a-f-]{36})$/i;
function deviceDetails(request){
 const agent=(request.headers.get('user-agent')||'').slice(0,800);
 const android=/Android\s*([\d.]+)?/i.exec(agent);
 // Chrome UA reduction freezes Android version as 10 and device model as K.
 // Neither value identifies the actual device (Chrome Privacy Sandbox spec).
 const reducedAndroid=/Android\s+10\s*;\s*K\s*(?:;|\))/i.test(agent);
 const ios=/(?:CPU(?: iPhone)? OS)\s*([\d_]+)/i.exec(agent);
 const isIpad=/iPad/i.test(agent),isIphone=/iPhone|iPod/i.test(agent);
 const system=android?(reducedAndroid?'Android (versión no disponible)':'Android'+(android[1]?' '+android[1]:'')):
   isIpad||isIphone?'iOS'+(ios?' '+ios[1].replace(/_/g,'.'):''):
   /Windows NT/i.test(agent)?'Windows':/Macintosh|Mac OS X/i.test(agent)?'macOS':
   /Linux/i.test(agent)?'Linux':'No identificado';
 let model=null;
 if(android&&!reducedAndroid){
   const hit=/(?:Android\s*[\d.]*;\s*)([^;)]+?)(?:\s+Build\/|\s*\)|;)/i.exec(agent);
   const candidate=hit?.[1]?.trim()||'';
   if(candidate && !/^(?:K|[a-z]{2}-[a-z]{2}|wv|mobile|u|linux)$/i.test(candidate))
     model=candidate.slice(0,100);
 }
 const deviceName=isIpad?'iPad':isIphone?'iPhone':android?'Teléfono Android':
  /Windows NT|Macintosh|Linux/i.test(agent)?'Computadora':'Dispositivo no identificado';
 const origin=request.headers.get('origin')||'';
 const platform=origin==='https://havana-nice-v2-dev.pages.dev'?'PWA':
   /ReactNative|okhttp|Expo/i.test(agent)?'Android nativo':
   origin?'Navegador web':'Cliente no identificado';
 return {platform,operatingSystem:system.slice(0,80),deviceName,model};
}
/** 
 * Type contract for optional device metadata, without runtime changes.
 * @param {any} env
 * @param {string} actorId
 * @param {string} eventType
 * @param {Request} request
 * @param {{platform:string,operatingSystem:string,deviceName:string,model:string|null}|null} [details]
 */
export async function recordMemberEvent(env,actorId,eventType,request,details=null){
 if(!ID.test(actorId)||!['login','connect','disconnect'].includes(eventType))return;
 const meta=details||deviceDetails(request);
 // Guard: a socket closing after deletion MUST NOT recreate access history.
 await env.DB.prepare(
  'INSERT INTO chat_access_events(id,actor_id,event_type,occurred_at,platform,operating_system,device_name,device_model) '+
  'SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM chat_members WHERE actor_id=?)'
 ).bind(crypto.randomUUID(),actorId,eventType,Date.now(),
   meta.platform,meta.operatingSystem,meta.deviceName,meta.model,actorId).run();
}
export function readMemberDevice(request){return deviceDetails(request);}
async function memberDeletionImpact(env,actorId){
 // Private, read-only snapshot. No tokens or message bodies are returned.
 const row=await env.DB.prepare(
  'SELECT '+
  '(SELECT COUNT(*) FROM chat_sessions WHERE actor_id=?) AS sessions,'+
  '(SELECT COUNT(*) FROM chat_messages WHERE sender_id=?) AS messages,'+
  '(SELECT COUNT(*) FROM chat_reactions WHERE actor_id=? OR message_seq IN (SELECT seq FROM chat_messages WHERE sender_id=?)) AS reactions,'+
  '(SELECT COUNT(*) FROM chat_read_receipts WHERE actor_id=?) AS receipts,'+
  '(SELECT COUNT(*) FROM chat_access_events WHERE actor_id=?) AS historyEvents'
 ).bind(actorId,actorId,actorId,actorId,actorId,actorId).first();
 const counts={};
 for(const key of ['sessions','messages','reactions','receipts','historyEvents'])
   counts[key]=Math.max(0,Number(row?.[key]||0));
 return counts;
}

function reply(respond,origin,body,status=200){return respond(body,status,origin);}
export async function handleAdminMemberManagement(request,env,url,origin,respond,ROOM){
 if(!await verifyAdminSession(request,env))
   return reply(respond,origin,{error:'No autorizado'},401);
 if(url.pathname==='/api/chat/admin/member-history' && request.method==='GET'){
   const actorId=url.searchParams.get('actorId')||'';
   if(!ID.test(actorId))return reply(respond,origin,{error:'Miembro inválido'},400);
   const member=await env.DB.prepare('SELECT actor_id FROM chat_members WHERE actor_id=?')
     .bind(actorId).first();
   if(!member)return reply(respond,origin,{error:'Miembro no encontrado'},404);
   const [counts,events]=await Promise.all([
     env.DB.prepare("SELECT COUNT(*) AS entries FROM chat_access_events WHERE actor_id=? AND event_type='login'")
       .bind(actorId).first(),
     env.DB.prepare(
       'SELECT event_type,occurred_at,platform,'+
       "CASE WHEN device_model='K' AND operating_system='Android 10' THEN 'Android (versión no disponible)' ELSE operating_system END AS operating_system,"+
       "device_name,CASE WHEN device_model='K' THEN NULL ELSE device_model END AS device_model "+
       'FROM chat_access_events WHERE actor_id=? ORDER BY occurred_at DESC LIMIT 100'
     ).bind(actorId).all()
   ]);
   return reply(respond,origin,{entries:Number(counts?.entries||0),events:events.results||[],
     since:'Solo desde la activación del historial; no se inventan registros anteriores.'});
 }
 if(url.pathname==='/api/chat/admin/member-delete-preview' && request.method==='GET'){
   const actorId=url.searchParams.get('actorId')||'';
   if(!ID.test(actorId))return reply(respond,origin,{error:'Miembro inválido'},400);
   const member=await env.DB.prepare('SELECT actor_id,display_name FROM chat_members WHERE actor_id=?')
     .bind(actorId).first();
   if(!member)return reply(respond,origin,{error:'Miembro no encontrado'},404);
   const counts=await memberDeletionImpact(env,actorId);
   return reply(respond,origin,{displayName:member.display_name,counts,canDelete:true});
 }
 if(url.pathname!=='/api/chat/admin/remove-member'||request.method!=='POST')
   return reply(respond,origin,{error:'Ruta no válida'},404);
 let payload;
 try{payload=await request.json();}catch{return reply(respond,origin,{error:'Solicitud inválida'},400);}
 const actorId=payload?.actorId,confirmName=payload?.confirmName;
 if(typeof actorId!=='string'||!ID.test(actorId)||typeof confirmName!=='string')
   return reply(respond,origin,{error:'Confirmación inválida'},400);
 const member=await env.DB.prepare(
   'SELECT actor_id,display_name FROM chat_members WHERE actor_id=?'
 ).bind(actorId).first();
 if(!member)return reply(respond,origin,{error:'Miembro no encontrado'},404);
 if(member.display_name!==confirmName)return reply(respond,origin,{
   error:'El nombre de confirmación no coincide.'},409);
 // Transaction order preserves message reply FKs and removes all musician-owned
 // D1 data. Never delete other actors' messages; replies to removed messages
 // keep their text with reply_to_seq=NULL.
 const queries=[
   env.DB.prepare('UPDATE chat_messages SET reply_to_seq=NULL WHERE reply_to_seq IN (SELECT seq FROM chat_messages WHERE sender_id=?)').bind(actorId),
   env.DB.prepare('DELETE FROM chat_reactions WHERE message_seq IN (SELECT seq FROM chat_messages WHERE sender_id=?)').bind(actorId),
   env.DB.prepare('DELETE FROM chat_reactions WHERE actor_id=?').bind(actorId),
   env.DB.prepare('DELETE FROM chat_messages WHERE sender_id=?').bind(actorId),
   env.DB.prepare('DELETE FROM chat_read_receipts WHERE actor_id=?').bind(actorId),
   env.DB.prepare('DELETE FROM chat_sessions WHERE actor_id=?').bind(actorId),
   env.DB.prepare('DELETE FROM chat_access_events WHERE actor_id=?').bind(actorId),
   env.DB.prepare('DELETE FROM chat_duplicate_login_alerts WHERE actor_id=?').bind(actorId),
   env.DB.prepare('DELETE FROM chat_single_device_owners WHERE actor_id=?').bind(actorId),
   env.DB.prepare('DELETE FROM chat_members WHERE actor_id=? AND display_name=?').bind(actorId,confirmName),
 ];
 const result=await env.DB.batch(queries);
 if(Number(result.at(-1)?.meta?.changes)!==1)
   return reply(respond,origin,{error:'No se pudo confirmar la eliminación'},409);
 // DO immediately expels the member's active Chat sockets; DB denial always
 // remains authoritative if DO is offline.
 try{
   await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM)).fetch(
    'https://internal/member-removed',{method:'POST',body:JSON.stringify({actorId})}
   );
 }catch{}
 await notifyAdminClients(env,'members');
 return reply(respond,origin,{ok:true,deleted:true});
}
