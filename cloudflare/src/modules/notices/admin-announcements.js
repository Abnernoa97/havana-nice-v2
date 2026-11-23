// Administrator announcements: separate system identity, no impersonated musician.
// Only an authenticated Admin may broadcast. D1 inbox survives push delivery failure.
import {verifyAdminSession} from '../admin/admin-auth.js';
import {queueNoticePush} from './push-center.js';
import {notifyFamilyClients} from '../family/family-realtime.js';

export async function handleAdminAnnouncements(request,env,url,origin,respond){
 if(!await verifyAdminSession(request,env))
  return respond({error:'Acceso administrativo necesario.'},401,origin);
 if(url.pathname!=='/api/chat/admin/announcements')
  return respond({error:'Ruta no encontrada'},404,origin);
 if(request.method==='GET'){
  try{
   const result=await env.DB.prepare(
    "SELECT broadcast_id,preview AS message,target_id AS url,created_at AS createdAt,COUNT(*) AS recipients "+
    "FROM admin_member_announcements GROUP BY broadcast_id ORDER BY createdAt DESC LIMIT 40"
   ).all();
   return respond({items:result.results||[]},200,origin);
  }catch{return respond({error:'Historial de notificaciones aún no disponible.'},503,origin);}
 }
 if(request.method!=='POST')return respond({error:'Método no permitido'},405,origin);
 let data;
 try{data=await request.json();}catch{return respond({error:'Solicitud inválida'},400,origin);}
 const message=typeof data?.message==='string'?data.message.normalize('NFC').trim():'';
 const urlValue=typeof data?.url==='string'?data.url.trim():'';
 let link='';
 if(urlValue){
  try{
   const parsed=new URL(urlValue);
   if(parsed.protocol!=='https:'||parsed.username||parsed.password||urlValue.length>700)
    throw Error('Enlace inválido');
   link=parsed.href;
  }catch{return respond({error:'Utiliza un enlace HTTPS válido.'},400,origin);}
 }
 if(message.length<1||message.length>160)
  return respond({error:'Escribe un mensaje de 1 a 160 caracteres.'},400,origin);
 const targets=Array.isArray(data?.recipientIds)&&data.recipientIds.length<=120?
  [...new Set(data.recipientIds.filter(v=>typeof v==='string'))]:null;
 if(!targets?.length)return respond({error:'Selecciona uno o más músicos.'},400,origin);
 let members;
 try{
  members=(await env.DB.prepare('SELECT actor_id FROM chat_members WHERE active=1').all()).results||[];
 }catch{return respond({error:'No se pudo comprobar el equipo.'},503,origin);}
 const permitted=new Set(members.map(m=>m.actor_id));
 if(targets.some(id=>!permitted.has(id)))
  return respond({error:'Hay integrantes que ya no están autorizados.'},409,origin);
 const id=crypto.randomUUID(),now=Date.now();
 const ids=targets.map(()=>crypto.randomUUID());
 try{
  const batch=targets.map((actorId,i)=>env.DB.prepare(
   'INSERT INTO admin_member_announcements '+
   '(id,broadcast_id,recipient_id,kind,target_id,preview,created_at) '+
   "VALUES(?,?,?,'admin.announcement',?,?,?)"
  ).bind(ids[i],id,actorId,link,message,now));
  await env.DB.batch(batch);
 }catch{return respond({error:'No se pudieron guardar los avisos.'},503,origin);}
 // Notification inbox is authoritative. Push may fail without losing the sent notice.
 await Promise.all(targets.map((recipientId,i)=>queueNoticePush(env,{
  noticeId:ids[i],recipientId,kind:'admin.announcement',targetId:id,
  title:'HAVANA NICE · Administración',body:message,
 }).catch(()=>0)));
 await notifyFamilyClients(env);
 return respond({ok:true,broadcastId:id,recipients:targets.length},201,origin);
}
