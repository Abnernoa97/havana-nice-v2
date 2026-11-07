// HAVANA NICE V2 — Repertoire is a self-contained module sharing the EXISTING
// admin/musician auth, Calendar event recipient visibility and D1 binding.
import {verifyAdminSession} from '../admin/admin-auth.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE=250;
const SONG_COLS='id,title,artist,category,position,active,reference_url,version,updated_at';
const ITEM_COLS='id,event_id,song_id,title,artist,reference_url,position,completed,updated_at';
const text=(input,max,label,required=false)=>{
 if(typeof input!=='string')throw Error(label+' debe ser texto');
 const value=input.normalize('NFC').trim();
 if(value.length>max||(required&&!value))throw Error(label+' inválido');
 return value;
};
const safeLink=(s)=>{
 const value=text(s??'',1500,'Referencia');
 if(!value)return value;
 try{if(new URL(value).protocol!=='https:')throw Error();}catch{throw Error('El link debe ser https://');}
 return value;
};
function songInput(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Canción inválida');
 const position=raw.position??0;
 if(!Number.isSafeInteger(position)||position<0||position>100000)throw Error('Orden inválido');
 return {title:text(raw.title??'',180,'Título',true),artist:text(raw.artist??'',180,'Artista'),
 category:text(raw.category??'ENGLISH',80,'Categoría',true),position,
 active:raw.active===undefined?true:raw.active===true,
 referenceUrl:safeLink(raw.referenceUrl)};
}
async function body(request){
 if((request.headers.get('content-type')||'').split(';')[0].trim()!=='application/json')throw Error('Se requiere JSON');
 const length=Number(request.headers.get('content-length')||0);
 if(length>20000)throw Error('Solicitud demasiado grande');
 const raw=await request.text();
 if(raw.length>20000)throw Error('Solicitud demasiado grande');
 try{return JSON.parse(raw);}catch{throw Error('JSON inválido');}
}
function publicSong(row){return {id:row.id,title:row.title,artist:row.artist,category:row.category,position:row.position,
 active:row.active===1,referenceUrl:row.reference_url,version:row.version,updatedAt:row.updated_at};}
function publicItem(row){return {id:row.id,eventId:row.event_id,songId:row.song_id,title:row.title,artist:row.artist,
 referenceUrl:row.reference_url,position:row.position,completed:row.completed===1,updatedAt:row.updated_at};}
async function eventAllowed(db,eventId,actorId){
 const row=await db.prepare('SELECT 1 AS ok FROM calendar_event_recipients WHERE event_id=? AND actor_id=?').bind(eventId,actorId).first();
 return !!row;
}
async function loadItems(db,eventId){
 const result=await db.prepare('SELECT '+ITEM_COLS+' FROM repertoire_event_items WHERE event_id=? ORDER BY position,id').bind(eventId).all();
 return (result.results||[]).map(publicItem);
}
async function itemList(db,eventId,member,admin){
 if(!admin&&!await eventAllowed(db,eventId,member.actorId))return null;
 return loadItems(db,eventId);
}
export async function handleRepertoireApi(request,env,url,origin,respond,verifyMusicianSession){
 const reply=(value,status=200)=>respond(value,status,origin);
 const path=url.pathname,admin=path.startsWith('/api/repertoire/admin/');
 let member=null;
 if(admin){
  if(!await verifyAdminSession(request,env))return reply({error:'No autorizado'},401);
 }else{
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  member=await verifyMusicianSession(env,token);
  if(!member)return reply({error:'No autorizado'},401);
 }
 try{
  if(path==='/api/repertoire/events/assigned'&&request.method==='GET'){
   // Never accept an actor ID from the client. Only the verified existing session
   // determines which Calendar events and songs this musician is allowed to read.
   const offset=Number(url.searchParams.get('offset')||0);
   if(!Number.isSafeInteger(offset)||offset<0||offset>10000)
    return reply({error:'Paginación inválida'},400);
   const sql='SELECT i.id,i.event_id,i.song_id,i.title,i.artist,i.reference_url,i.position,i.completed,i.updated_at'+
    ' FROM repertoire_event_items i INNER JOIN calendar_event_recipients r ON r.event_id=i.event_id'+
    ' WHERE r.actor_id=? ORDER BY i.event_id,i.position,i.id LIMIT ? OFFSET ?';
   const response=await env.DB.prepare(sql).bind(member.actorId,PAGE+1,offset).all();
   const rows=response.results||[];
   return reply({items:rows.slice(0,PAGE).map(publicItem),hasMore:rows.length>PAGE});
  }
  if((path==='/api/repertoire/songs'||path==='/api/repertoire/admin/songs')&&request.method==='GET'){
   const offset=Number(url.searchParams.get('offset')||0);
   if(!Number.isSafeInteger(offset)||offset<0||offset>10000)return reply({error:'Paginación inválida'},400);
   const where=admin?'':' WHERE active=1';
   const sql='SELECT '+SONG_COLS+' FROM repertoire_songs'+where+
    ' ORDER BY category,position,title,id LIMIT ? OFFSET ?';
   const res=await env.DB.prepare(sql).bind(PAGE+1,offset).all();
   const entries=res.results||[];
   return reply({songs:entries.slice(0,PAGE).map(publicSong),hasMore:entries.length>PAGE});
  }
  if(path==='/api/repertoire/admin/songs'&&request.method==='POST'){
   const value=songInput(await body(request));
   const id=crypto.randomUUID(),now=new Date().toISOString();
   await env.DB.prepare('INSERT INTO repertoire_songs(id,title,artist,category,position,active,reference_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id,value.title,value.artist,value.category,value.position,value.active?1:0,value.referenceUrl,now,now).run();
   return reply({song:{id,...value,version:1,updatedAt:now}},201);
  }
  const songPath=/^\/api\/repertoire\/admin\/songs\/([0-9a-f-]+)$/.exec(path);
  if(songPath&&UUID.test(songPath[1])){
   const id=songPath[1],data=await body(request);
   if(!Number.isSafeInteger(data?.version)||data.version<1)return reply({error:'Versión inválida'},400);
   if(request.method==='POST'){
    const value=songInput(data),now=new Date().toISOString();
    const result=await env.DB.prepare('UPDATE repertoire_songs SET title=?,artist=?,category=?,position=?,active=?,reference_url=?,version=version+1,updated_at=? WHERE id=? AND version=?')
     .bind(value.title,value.artist,value.category,value.position,value.active?1:0,value.referenceUrl,now,id,data.version).run();
    if(result.meta?.changes!==1)return reply({error:'La canción cambió; actualiza antes de editar.'},409);
    return reply({song:{id,...value,version:data.version+1,updatedAt:now}});
   }
   if(request.method==='DELETE'){
    // Event copies keep their title/artist/link snapshots via ON DELETE SET NULL.
    const result=await env.DB.prepare('DELETE FROM repertoire_songs WHERE id=? AND version=?')
     .bind(id,data.version).run();
    if(result.meta?.changes!==1)return reply({error:'La canción cambió; actualiza antes de borrar.'},409);
    return reply({ok:true});
   }
  }
  const eventPath=/^\/api\/repertoire\/(?:admin\/)?events\/([0-9a-f-]+)\/items$/.exec(path);
  if(eventPath&&UUID.test(eventPath[1])){
   const eventId=eventPath[1];
   if(request.method==='GET'){
    const items=await itemList(env.DB,eventId,member,admin);
    return items===null?reply({error:'Evento no asignado'},403):reply({items});
   }
   if(!admin)return reply({error:'No autorizado'},403);
   if(request.method==='POST'){
    const data=await body(request);
    const masterIds=data?.songIds;
    const isMaster=Array.isArray(masterIds);
    if(isMaster){
     if(!masterIds.length||masterIds.length>100||new Set(masterIds).size!==masterIds.length||!masterIds.every(id=>typeof id==='string'&&UUID.test(id)))
      return reply({error:'Selecciona canciones válidas'},400);
    }
    if(!isMaster&&(!data?.special||typeof data.special!=='object'||Array.isArray(data.special)))
     return reply({error:'Canción especial inválida'},400);
    const custom=isMaster?null:{title:text(data.special.title??'',180,'Título',true),
     artist:text(data.special.artist??'',180,'Artista'),referenceUrl:safeLink(data.special.referenceUrl)};
    const event=await env.DB.prepare('SELECT id FROM calendar_events WHERE id=?').bind(eventId).first();
    if(!event)return reply({error:'Evento no encontrado'},404);
    const existing=await env.DB.prepare('SELECT song_id FROM repertoire_event_items WHERE event_id=? AND song_id IS NOT NULL').bind(eventId).all();
    const already=new Set((existing.results||[]).map(r=>r.song_id));
    const rows=isMaster?(await env.DB.prepare('SELECT '+SONG_COLS+' FROM repertoire_songs WHERE id IN ('+
     masterIds.map(()=>'?').join(',')+') AND active=1').bind(...masterIds).all()).results||[]:[];
    if(isMaster&&rows.length!==masterIds.length)return reply({error:'Una canción ya no está activa.'},409);
    const toInsert=isMaster?masterIds.filter(id=>!already.has(id)).map(id=>rows.find(s=>s.id===id)): [null];
    if(isMaster&&!toInsert.length)return reply({added:0,items:await loadItems(env.DB,eventId)});
    const count=await env.DB.prepare('SELECT COALESCE(MAX(position),-1) AS max_position FROM repertoire_event_items WHERE event_id=?').bind(eventId).first();
    const start=Number(count?.max_position||0)+1,now=new Date().toISOString();
    const statements=toInsert.map((row,i)=>env.DB.prepare(
     'INSERT INTO repertoire_event_items(id,event_id,song_id,title,artist,reference_url,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
     .bind(crypto.randomUUID(),eventId,row?.id||null,row?.title||custom.title,row?.artist||custom.artist,
      row?.reference_url||custom.referenceUrl,start+i,now,now));
    await env.DB.batch(statements);
    return reply({added:statements.length,items:await loadItems(env.DB,eventId)},201);
   }
  }
  const orderPath=/^\/api\/repertoire\/admin\/events\/([0-9a-f-]+)\/order$/.exec(path);
  if(orderPath&&UUID.test(orderPath[1])&&request.method==='POST'){
   const eventId=orderPath[1],data=await body(request);
   const ids=data?.itemIds;
   if(!Array.isArray(ids)||ids.length>250||!ids.every(id=>typeof id==='string'&&UUID.test(id))||
      new Set(ids).size!==ids.length)return reply({error:'Orden inválido'},400);
   const stored=await env.DB.prepare('SELECT id FROM repertoire_event_items WHERE event_id=?').bind(eventId).all();
   const existing=(stored.results||[]).map(x=>x.id);
   if(existing.length!==ids.length||!existing.every(id=>ids.includes(id)))return reply({error:'La lista cambió; actualiza antes de ordenarla.'},409);
   if(ids.length){
    const now=new Date().toISOString();
    await env.DB.batch(ids.map((id,i)=>env.DB.prepare(
     'UPDATE repertoire_event_items SET position=?,updated_at=? WHERE event_id=? AND id=?')
      .bind(i,now,eventId,id)));
   }
   return reply({items:await loadItems(env.DB,eventId)});
  }
  const itemPath=/^\/api\/repertoire\/admin\/items\/([0-9a-f-]+)$/.exec(path);
  if(itemPath&&UUID.test(itemPath[1])){
   if(request.method==='DELETE'){
    const result=await env.DB.prepare('DELETE FROM repertoire_event_items WHERE id=?').bind(itemPath[1]).run();
    return result.meta?.changes===1?reply({ok:true}):reply({error:'Canción del evento no encontrada'},404);
   }
   if(request.method==='POST'){
    const data=await body(request);
    if(typeof data?.completed!=='boolean')return reply({error:'Progreso inválido'},400);
    const result=await env.DB.prepare('UPDATE repertoire_event_items SET completed=?,updated_at=? WHERE id=?')
     .bind(data.completed?1:0,new Date().toISOString(),itemPath[1]).run();
    return result.meta?.changes===1?reply({ok:true}):reply({error:'Canción no encontrada'},404);
   }
  }
  return reply({error:'Ruta no encontrada'},404);
 }catch(error){
  if(error instanceof Error&&/inválid|título|texto|artista|categoría|link|demasiado|JSON|https/.test(error.message.toLowerCase()))
   return reply({error:error.message},400);
  return reply({error:'No se pudo completar la operación de Repertorio.'},503);
 }
}
