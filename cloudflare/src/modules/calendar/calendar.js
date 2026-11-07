// HAVANA NICE V2 — one private D1 calendar; legacy original never accessed.
// Admin writes event + selected recipients atomically. Member reads only assigned dates.
import {verifyAdminSession} from '../admin/admin-auth.js';
import {notifyCalendarClients} from './calendar-realtime.js';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The canonical musician actor IDs are member:<opaque-id>, NOT event UUIDs.
const ACTOR_ID=/^member:[a-z0-9_-]{1,64}$/i;
const STATUSES=new Set(['tentative','confirmed','cancelled']);
const COLUMNS='e.id,e.event_date,e.time_zone,e.title,e.venue,e.city,e.call_time,e.soundcheck_time,e.arrival_time,e.show_time,e.end_time,e.wardrobe,e.details,e.contact_name,e.contact_phone,e.notes,e.map_url,e.status,e.status_text,e.version,e.updated_at';
const PAGE_SIZE=100;
const ERR={401:'No autorizado',409:'La fecha cambió. Actualiza antes de editar.'};
function string(value,max,label,required=false){
 if(typeof value!=='string')throw Error(label+' debe ser texto');
 const text=value.normalize('NFC').trim();
 if(text.length>max||(required&&!text))throw Error(label+' inválido o demasiado largo');
 return text;
}
// The user may enter any date text. Parse known formats for ordering only.
function optionalSortDate(input){
 const value=input.trim();
 let y,m,d;
 const iso=/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
 const local=/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(value);
 if(iso){y=Number(iso[1]);m=Number(iso[2]);d=Number(iso[3]);}
 else if(local){y=Number(local[3]);m=Number(local[2]);d=Number(local[1]);}
 else return null;
 const date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return null;
 return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
}
function time(value){
 return string(value??'',60,'Hora'); // Full text flexibility.
}
function fields(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Evento inválido');
 const date=string(input.date??'',160,'Fecha');
 const timeZone=string(input.timeZone??'America/Mexico_City',64,'Zona horaria',true);
 try{new Intl.DateTimeFormat('en',{timeZone});}catch{throw Error('Zona horaria inválida');}
 const status=input.status??'confirmed';
 if(!STATUSES.has(status))throw Error('Estado inválido');
 const mapUrl=string(input.mapUrl??'',1500,'Google Maps');
 // Arbitrary text is stored unchanged; clients only link real HTTPS URLs.
 const recipients=input.recipientIds;
 if(!Array.isArray(recipients)||recipients.length===0||recipients.length>100)
  throw Error('Selecciona al menos un músico destinatario');
 if(!recipients.every(id=>typeof id==='string'&&ACTOR_ID.test(id))||
  new Set(recipients).size!==recipients.length)throw Error('Destinatarios inválidos');
 return {
  date,dateSort:optionalSortDate(date),timeZone,title:string(input.title,160,'Evento',true),
  venue:string(input.venue??'',160,'Lugar'),city:string(input.city??'',120,'Ciudad'),
  callTime:time(input.callTime),soundcheckTime:time(input.soundcheckTime),
  arrivalTime:time(input.arrivalTime),showTime:time(input.showTime),endTime:time(input.endTime),
  wardrobe:string(input.wardrobe??'',500,'Vestuario'),details:string(input.details??'',4000,'Detalles'),
  contactName:string(input.contactName??'',160,'Contacto'),
  contactPhone:string(input.contactPhone??'',80,'Teléfono'),
  notes:string(input.notes??'',4000,'Notas'),mapUrl,status,
  statusText:string(input.statusText??'',160,'Estado'),recipientIds:recipients
 };
}
const valueList=x=>[x.date,x.timeZone,x.title,x.venue,x.city,x.callTime,x.soundcheckTime,
 x.arrivalTime,x.showTime,x.endTime,x.wardrobe,x.details,x.contactName,x.contactPhone,x.notes,x.mapUrl,x.status,x.dateSort,x.statusText];
function event(row,admin=false){
 const result={
  id:row.id,date:row.event_date,timeZone:row.time_zone,title:row.title,
  venue:row.venue,city:row.city,callTime:row.call_time,soundcheckTime:row.soundcheck_time,
  arrivalTime:row.arrival_time,showTime:row.show_time,endTime:row.end_time,
  wardrobe:row.wardrobe,details:row.details,contactName:row.contact_name,
  contactPhone:row.contact_phone,notes:row.notes,mapUrl:row.map_url,
  status:row.status,statusText:row.status_text||'',version:row.version,updatedAt:row.updated_at
 };
 if(admin)result.recipientIds=JSON.parse(row.recipients_json||'[]');
 return result;
}
async function bodyOf(request){
 if((request.headers.get('content-type')||'').split(';')[0].trim()!=='application/json')
  throw Error('Se requiere JSON');
 if(Number(request.headers.get('content-length')||0)>20000)throw Error('Solicitud demasiado grande');
 const text=await request.text();
 if(text.length>20000)throw Error('Solicitud demasiado grande');
 try{return JSON.parse(text);}catch{throw Error('JSON inválido');}
}
async function authorizedRecipients(db,ids){
 const placeholders=ids.map(()=>'?').join(',');
 const data=await db.prepare('SELECT actor_id FROM chat_members WHERE active=1 AND actor_id IN ('+placeholders+')').bind(...ids).all();
 if((data.results||[]).length!==ids.length)throw Error('Seleccionaste un músico que ya no está activo. Actualiza la lista.');
}
function invalid(error,reply){
 return reply({error:error instanceof Error?error.message:'Solicitud inválida'},400);
}
export async function handleCalendarApi(request,env,url,origin,respond,verifyMusicianSession){
 const reply=(body,status=200)=>respond(body,status,origin);
 const path=url.pathname;
 const admin=path.startsWith('/api/calendar/admin/');
 let member=null;
 if(admin){
  if(!await verifyAdminSession(request,env))return reply({error:ERR[401]},401);
 }else{
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  member=await verifyMusicianSession(env,token);
  if(!member)return reply({error:ERR[401]},401);
 }
 if((path==='/api/calendar/events'||path==='/api/calendar/admin/events')&&request.method==='GET'){
  const offset=Number(url.searchParams.get('offset')||'0');
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000)return reply({error:'Paginación inválida'},400);
  const assigned=admin?'':' WHERE EXISTS (SELECT 1 FROM calendar_event_recipients r WHERE r.event_id=e.id AND r.actor_id=?)';
  const sql='SELECT '+COLUMNS+(admin?',(SELECT json_group_array(actor_id) FROM calendar_event_recipients r WHERE r.event_id=e.id) AS recipients_json':'')+
   ' FROM calendar_events e'+assigned+' ORDER BY CASE WHEN e.date_sort IS NULL THEN 1 ELSE 0 END,e.date_sort ASC,e.event_date ASC,e.id ASC LIMIT ? OFFSET ?';
  try{
   const args=admin?[PAGE_SIZE+1,offset]:[member.actorId,PAGE_SIZE+1,offset];
   const result=await env.DB.prepare(sql).bind(...args).all();
   const rows=result.results||[];
   return reply({events:rows.slice(0,PAGE_SIZE).map(x=>event(x,admin)),hasMore:rows.length>PAGE_SIZE});
  }catch{return reply({error:'Calendario no disponible'},503);}
 }
 if(!admin)return reply({error:'Ruta no encontrada'},404);
 if(path==='/api/calendar/admin/events'&&request.method==='POST'){
  let payload;
  try{payload=fields(await bodyOf(request));await authorizedRecipients(env.DB,payload.recipientIds);}
  catch(e){return invalid(e,reply);}
  const id=crypto.randomUUID(),revision=crypto.randomUUID(),now=new Date().toISOString();
  try{
   const statements=[
    env.DB.prepare('INSERT INTO calendar_events(id,event_date,time_zone,title,venue,city,call_time,soundcheck_time,arrival_time,show_time,end_time,wardrobe,details,contact_name,contact_phone,notes,map_url,status,date_sort,status_text,version,revision_token,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)')
     .bind(id,...valueList(payload),revision,now,now),
    ...payload.recipientIds.map(actorId=>env.DB.prepare(
     'INSERT INTO calendar_event_recipients(event_id,actor_id) VALUES (?,?)').bind(id,actorId))
   ];
   await env.DB.batch(statements);
   await notifyCalendarClients(env,payload.recipientIds);
   return reply({event:{id,...payload,version:1,updatedAt:now}},201);
  }catch{return reply({error:'No se pudo crear la fecha'},503);}
 }
 const match=/^\/api\/calendar\/admin\/events\/([0-9a-f-]+)$/.exec(path);
 if(!match||!ID.test(match[1]))return reply({error:'Ruta no encontrada'},404);
 const id=match[1];
 if(request.method==='POST'){
  let raw,payload;
  try{
   raw=await bodyOf(request);
   if(!Number.isSafeInteger(raw?.version)||raw.version<1)throw Error('Versión inválida');
   payload=fields(raw);
   await authorizedRecipients(env.DB,payload.recipientIds);
  }catch(e){return invalid(e,reply);}
  // Alert both new and previous recipients: removed musicians must lose the date at once.
  const before=await env.DB.prepare('SELECT actor_id FROM calendar_event_recipients WHERE event_id=?')
   .bind(id).all();
  const previous=(before.results||[]).map(row=>row.actor_id);
  const revision=crypto.randomUUID(),now=new Date().toISOString();
  try{
   const update=env.DB.prepare('UPDATE calendar_events SET event_date=?,time_zone=?,title=?,venue=?,city=?,call_time=?,soundcheck_time=?,arrival_time=?,show_time=?,end_time=?,wardrobe=?,details=?,contact_name=?,contact_phone=?,notes=?,map_url=?,status=?,date_sort=?,status_text=?,version=version+1,revision_token=?,updated_at=? WHERE id=? AND version=?')
    .bind(...valueList(payload),revision,now,id,raw.version);
   // Revision marker makes recipient mutations conditional on THIS successful
   // update, never on the previous version during concurrent edits.
   const exists='EXISTS (SELECT 1 FROM calendar_events WHERE id=? AND revision_token=?)';
   const replaceRecipients=[
    env.DB.prepare('DELETE FROM calendar_event_recipients WHERE event_id=? AND '+exists).bind(id,id,revision),
    ...payload.recipientIds.map(actorId=>env.DB.prepare(
     'INSERT INTO calendar_event_recipients(event_id,actor_id) SELECT ?,? WHERE '+exists)
     .bind(id,actorId,id,revision))
   ];
   const results=await env.DB.batch([update,...replaceRecipients]);
   if(Number(results[0]?.meta?.changes)!==1)return reply({error:ERR[409]},409);
   await notifyCalendarClients(env,[...previous,...payload.recipientIds]);
   return reply({event:{id,...payload,version:raw.version+1,updatedAt:now}});
  }catch{return reply({error:'No se pudo guardar la fecha'},503);}
 }
 if(request.method==='DELETE'){
  let raw;
  try{
   raw=await bodyOf(request);
   if(!Number.isSafeInteger(raw?.version)||raw.version<1)throw Error('Versión inválida');
  }catch(e){return invalid(e,reply);}
  try{
   const previous=await env.DB.prepare('SELECT actor_id FROM calendar_event_recipients WHERE event_id=?')
    .bind(id).all();
   const result=await env.DB.prepare('DELETE FROM calendar_events WHERE id=? AND version=?').bind(id,raw.version).run();
   if(Number(result.meta?.changes)!==1)return reply({error:ERR[409]},409);
   await notifyCalendarClients(env,(previous.results||[]).map(row=>row.actor_id));
   return reply({ok:true});
  }catch{return reply({error:'No se pudo eliminar la fecha'},503);}
 }
 return reply({error:'Método no permitido'},405);
}
