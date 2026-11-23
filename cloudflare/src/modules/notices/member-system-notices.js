// HAVANA NICE V2 - Administration-origin notices, never a fake musician.
// Calendar, event/general repertoire, and general BOOK 3D publications.
import {queueNoticePush} from './push-center.js';

export async function notifyRepertoireMembers(env,eventId,action,changeId){
 if(!eventId||!changeId)return 0;
 const intro=action==='added'?'Administración agregó canciones':
  action==='removed'?'Administración quitó una canción':
  action==='reordered'?'Administración reordenó las canciones':
  action==='completed'?'Administración actualizó el avance':
  'Administración actualizó el repertorio';
 try{
  const members=(await env.DB.prepare(
   'SELECT DISTINCT r.actor_id FROM calendar_event_recipients r '+
   'JOIN chat_members m ON m.actor_id=r.actor_id AND m.active=1 '+
   'WHERE r.event_id=?'
  ).bind(eventId).all()).results||[];
  let title='tu evento';
  try{
   const event=await env.DB.prepare(
    'SELECT title FROM calendar_events WHERE id=?'
   ).bind(eventId).first();
   if(event?.title)title=String(event.title).replace(/[\r\n]/g,' ').slice(0,64);
  }catch{/* Event naming is optional; never block a committed event notice. */}
  const preview=(intro+' del repertorio de '+title).slice(0,160);
  const now=Date.now();
  const noticeIds=members.map(()=>crypto.randomUUID());
  if(!members.length)return 0;
  const inserts=members.map((person,i)=>env.DB.prepare(
   'INSERT OR IGNORE INTO member_system_notifications '+
   '(id,recipient_id,kind,target_id,preview,created_at,dedupe_key) '+
   "VALUES(?,?,'repertoire.updated',?,?,?,?)"
  ).bind(noticeIds[i],person.actor_id,eventId,preview,now,
   'repertoire:'+eventId+':'+changeId+':'+person.actor_id));
  const results=await env.DB.batch(inserts);
  let count=0;
  for(let i=0;i<members.length;i++){
   if(Number(results[i]?.meta?.changes||0)!==1)continue;
   count++;
   await queueNoticePush(env,{noticeId:noticeIds[i],recipientId:members[i].actor_id,
    kind:'repertoire.updated',targetId:eventId,title:'HAVANA NICE · Repertorio',body:preview});
  }
  return count;
 }catch{
  // Failed push must never roll back an Admin's committed repertoire change.
  return 0;
 }
}

// New Android/PWA States are team activity, not a private author-only reply.
// Each published batch creates ONE notice per other authorized musician.
// The endpoint never trusts recipients supplied by the uploader.
// Changes to the *general* song library are useful to every active musician;
// this is an Admin system notice, not a forged message from an album owner.
export async function notifyGeneralRepertoireMembers(env,action,songTitle,changeId){
 if(!changeId)return 0;
 const title=String(songTitle||'una canción').replace(/[\r\n]/g,' ').slice(0,72);
 const preview=(action==='added'?'Administración agregó '+title+
  ' al repertorio general':
  action==='removed'?'Administración eliminó '+title+
  ' del repertorio general':
  'Administración actualizó '+title+' en el repertorio general').slice(0,160);
 try{
  const members=(await env.DB.prepare(
   'SELECT actor_id FROM chat_members WHERE active=1'
  ).bind().all()).results||[];
  if(!members.length)return 0;
  const now=Date.now(),ids=members.map(()=>crypto.randomUUID());
  const inserted=await env.DB.batch(members.map((member,i)=>env.DB.prepare(
   "INSERT OR IGNORE INTO member_system_notifications "+
   "(id,recipient_id,kind,target_id,preview,created_at,dedupe_key) "+
   "VALUES(?,?,'repertoire.updated','general',?,?,?)"
  ).bind(ids[i],member.actor_id,preview,now,
   'repertoire:general:'+changeId+':'+member.actor_id)));
  let count=0;
  for(let i=0;i<members.length;i++){
   if(Number(inserted[i]?.meta?.changes||0)!==1)continue;
   count++;
   await queueNoticePush(env,{noticeId:ids[i],recipientId:members[i].actor_id,
    kind:'repertoire.updated',targetId:'general',
    title:'HAVANA NICE · Repertorio general',body:preview});
  }
  return count;
 }catch{return 0;}
}

// The approved general BOOK is a system publication, never a page turn.
// A two-minute burst of uploads produces ONE notice per teammate.
export async function notifyBookPublished(env,pageId){
 if(!pageId)return 0;
 try{
  const members=(await env.DB.prepare(
   'SELECT actor_id FROM chat_members WHERE active=1'
  ).bind().all()).results||[];
  if(!members.length)return 0;
  const now=Date.now(),bucket=Math.floor(now/120000);
  const ids=members.map(()=>crypto.randomUUID());
  const preview='Administración publicó nuevo contenido en el BOOK 3D';
  const inserted=await env.DB.batch(members.map((member,i)=>env.DB.prepare(
   'INSERT OR IGNORE INTO book_member_notifications '+
   '(id,recipient_id,kind,target_id,preview,created_at,dedupe_key) '+
   "VALUES(?,?,'book.updated',?,?,?,?)"
  ).bind(ids[i],member.actor_id,pageId,preview,now,
   'book:published:'+bucket+':'+member.actor_id)));
  let count=0;
  for(let i=0;i<members.length;i++){
   if(Number(inserted[i]?.meta?.changes||0)!==1)continue;
   count++;
   await queueNoticePush(env,{noticeId:ids[i],recipientId:members[i].actor_id,
    kind:'book.updated',targetId:'general',
    title:'HAVANA NICE · BOOK 3D',body:preview});
  }
  return count;
 }catch{return 0;}
}

export async function notifyCalendarMembers(env,recipients,{eventId,revision,action,title,date}){
 const unique=[...new Set(recipients)].filter(x=>typeof x==='string'&&x.startsWith('member:'));
 if(!unique.length)return 0;
 const preview=(action==='created'?'Nuevo evento':action==='deleted'?'Evento eliminado':'Evento actualizado')+
  ': '+String(title||'').slice(0,95)+(date?' · '+String(date).slice(0,32):'');
 const now=Date.now();
 const noticeIds=unique.map(()=>crypto.randomUUID());
 const statements=unique.map((recipient,i)=>env.DB.prepare(
  'INSERT OR IGNORE INTO calendar_member_notifications '+
  '(id,recipient_id,kind,target_id,preview,created_at,dedupe_key) '+
  "SELECT ?,m.actor_id,'calendar.event',?,?,?,? FROM chat_members m "+
  'WHERE m.actor_id=? AND m.active=1'
 ).bind(noticeIds[i],String(eventId),preview.slice(0,160),now,
  'calendar:'+String(eventId)+':'+String(revision)+':'+recipient,recipient));
 try{
  // A deployment without migration 0037 must not break Calendar edits.
  const results=await env.DB.batch(statements);
  let inserted=0;
  for(let i=0;i<unique.length;i++){
   if(Number(results[i]?.meta?.changes||0)<1)continue;
   inserted++;
   await queueNoticePush(env,{noticeId:noticeIds[i],recipientId:unique[i],
    kind:'calendar.event',targetId:String(eventId),
    title:'HAVANA NICE · Calendario',body:preview});
  }
  return inserted;
 }catch{return 0;}
}

