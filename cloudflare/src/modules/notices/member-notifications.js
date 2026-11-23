import {sha256Hex} from '../../shared/crypto-helpers.js';
import {queueNoticePush} from './push-center.js';
import {memberPushCopy} from './push-copy.js';
// Private per-member inbox. One existing musician session; no new socket or credentials.
// Notifications contain short metadata, never private media URLs or tokens.
const asJson=(value,status,origin)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private,no-store',
 'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev','vary':'Origin'}
});
const UUID=/^[a-f0-9-]{36}$/i;

// Future modules use this single emitter. The actor and recipient are derived
// from server-owned records, never from user-supplied notification recipients.
export async function notifyMember(env,{recipientId,actorId,kind,targetId,emoji='',preview='',dedupeKey=null,allowSelf=false}){
 // Admin-managed Familia media is attributed to an album owner, but the owner
 // must also receive the system activity; all ordinary self-events are excluded.
 if(!recipientId||!actorId||(!allowSelf&&recipientId===actorId))return false;
 const now=Date.now();
 const noticeId=crypto.randomUUID();
 const response=await env.DB.prepare(
  'INSERT OR IGNORE INTO member_notifications '+
  '(id,recipient_id,actor_id,kind,target_id,emoji,preview,created_at,dedupe_key) '+
  'SELECT ?,r.actor_id,a.actor_id,?,?,?,?,?,? FROM chat_members r '+
  'JOIN chat_members a ON a.actor_id=? AND a.active=1 '+
  'WHERE r.actor_id=? AND r.active=1'
 ).bind(noticeId,String(kind).slice(0,60),String(targetId).slice(0,100),
  String(emoji).slice(0,12),String(preview).slice(0,160),now,dedupeKey,
  actorId,recipientId).run();
 const created=Number(response.meta?.changes||0)>0;
 if(created){
  // The roster owns the display name. Never expose a message body,
  // audio content, R2 URL or login token on the lock screen.
  const author=await env.DB.prepare(
   'SELECT display_name FROM chat_members WHERE actor_id=? AND active=1'
  ).bind(actorId).first();
  const copy=memberPushCopy({kind,actorName:author?.display_name,emoji,preview});
  await queueNoticePush(env,{noticeId,recipientId,kind,targetId,...copy});
 }
 return created;
}

// Single typed central emitter for every team-wide member activity. No
// client-supplied recipient list, new identity, socket, or independent inbox.
// An Admin can add media to a member's album; only that case includes the owner.
export async function notifyTeamActivity(env,actorId,kind,targetId,{
 preview='',includeOwner=false
}={}){
 if(!actorId||!targetId||!['profile.photo','family.media','repertoire.updated'].includes(kind))
  return 0;
 const roster=(await env.DB.prepare(
  'SELECT actor_id FROM chat_members WHERE active=1'
 ).bind().all()).results||[];
 let count=0;
 for(const row of roster){
  try{
   if(await notifyMember(env,{recipientId:row.actor_id,actorId,kind,targetId,
    preview,dedupeKey:kind+':'+targetId+':'+row.actor_id,
    allowSelf:includeOwner}))count++;
  }catch{/* A broken recipient must not undo the committed upload. */}
 }
 return count;
}
export async function notifyTeamProfilePhoto(env,actor,photoKey){
 // Never include an R2 object key in an inbox or a push notification.
 return notifyTeamActivity(env,actor.actorId,'profile.photo',await sha256Hex(photoKey),{
  preview:'Actualizó su foto de perfil'
 });
}
export async function notifyTeamFamilyMedia(env,albumActorId,mediaId,kind){
 // The upload action was performed by Admin; this is an album update,
 // not a claim that the album owner personally uploaded anything.
 return notifyTeamActivity(env,albumActorId,'family.media',mediaId,{
  preview:kind==='video'?'Nuevo video en Familia':'Nueva fotografía en Familia',
  includeOwner:true
 });
}

// Admin changes to an event's Repertoire are SYSTEM activity, never a
// counterfeit musician message. Only Calendar-assigned musicians receive it.
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
  const event=await env.DB.prepare(
   'SELECT title FROM calendar_events WHERE id=?'
  ).bind(eventId).first();
  const title=String(event?.title||'tu evento').replace(/[\r\n]/g,' ').slice(0,64);
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
  ).all()).results||[];
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
  ).all()).results||[];
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

export async function notifyTeamStoryPublished(env,actor,storyId,count=1){
 if(!actor?.actorId||!storyId)return 0;
 try{
  const roster=(await env.DB.prepare(
   'SELECT actor_id FROM chat_members WHERE active=1 AND actor_id<>?'
  ).bind(actor.actorId).all()).results||[];
  let inserted=0;
  for(const person of roster){
   try{
    if(await notifyMember(env,{recipientId:person.actor_id,actorId:actor.actorId,
     kind:'story.created',targetId:storyId,
     preview:count>1?count+' nuevos Estados publicados':'Nuevo Estado publicado',
     dedupeKey:'story.created:'+storyId+':'+person.actor_id}))inserted++;
   }catch{/* One bad recipient cannot prevent other musicians being notified. */}
  }
  return inserted;
 }catch{return 0;}
}

// Private inbox for real Chat events. The author and recipients come from
// the authenticated ChatRoom/D1 records, never an untrusted client payload.
export async function notifyTeamChatMessage(env,actorId,messageSeq,preview=''){
 if(!actorId||!Number.isSafeInteger(messageSeq)||messageSeq<1)return 0;
 const recipients=(await env.DB.prepare(
  'SELECT actor_id FROM chat_members WHERE active=1 AND actor_id<>?'
 ).bind(actorId).all()).results||[];
 let created=0;
 for(const member of recipients){
  try{
   if(await notifyMember(env,{recipientId:member.actor_id,actorId,
    kind:'chat.message',targetId:String(messageSeq),preview:String(preview).slice(0,120),
    dedupeKey:'chat.message:'+messageSeq+':'+member.actor_id}))created++;
  }catch{/* A single disabled recipient must never block a saved Chat message. */}
 }
 return created;
}
export async function notifyChatReaction(env,actorId,messageSeq,emoji){
 if(!actorId||!Number.isSafeInteger(messageSeq)||messageSeq<1)return false;
 const target=await env.DB.prepare(
  'SELECT sender_id FROM chat_messages WHERE seq=? AND deleted_at IS NULL'
 ).bind(messageSeq).first();
 if(!target||target.sender_id===actorId)return false;
 return notifyMember(env,{recipientId:target.sender_id,actorId,
  kind:'chat.reaction',targetId:String(messageSeq),emoji,
  preview:'Reacción a tu mensaje',
  dedupeKey:'chat.reaction:'+messageSeq+':'+actorId+':'+emoji});
}

export async function notifyStoryOwner(env,storyId,actor,kind,{emoji='',preview='',dedupeKey=null}={}){
 const story=await env.DB.prepare(
  'SELECT s.actor_id FROM member_stories s JOIN chat_members m '+
  'ON m.actor_id=s.actor_id AND m.active=1 WHERE s.id=? AND s.expires_at>?'
 ).bind(storyId,Date.now()).first();
 if(!story||story.actor_id===actor.actorId)return false;
 return notifyMember(env,{recipientId:story.actor_id,actorId:actor.actorId,kind,
  targetId:storyId,emoji,preview,dedupeKey});
}

// Calendar is emitted by the Administrator, not by a musician. Keep system
// notices apart from member-to-member reactions: no forged actor ID or login.
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

export async function handleMemberNotices(request,env,url,origin,verifySession){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const actor=await verifySession(env,token);
 if(!actor)return asJson({error:'No autorizado.'},401,origin);
 try{
  if(url.pathname==='/api/notices'&&request.method==='GET'){
   const base='SELECT n.id,n.actor_id,a.display_name,n.kind,n.target_id,n.emoji,'+
    'n.preview,n.created_at,n.read_at FROM member_notifications n '+
    'JOIN chat_members a ON a.actor_id=n.actor_id WHERE n.recipient_id=?';
   let rows=[],calendarUnread=0,systemUnread=0,bookUnread=0;
   // All three sources share the same chronological inbox. System events
   // remain actorless rather than pretending the administrator is a musician.
   const calendar="SELECT c.id,NULL AS actor_id,'HAVANA NICE' AS display_name,c.kind,"+
    "c.target_id,'' AS emoji,c.preview,c.created_at,c.read_at "+
    'FROM calendar_member_notifications c WHERE c.recipient_id=?';
   const system="SELECT s.id,NULL AS actor_id,'HAVANA NICE' AS display_name,s.kind,"+
    "s.target_id,'' AS emoji,s.preview,s.created_at,s.read_at "+
    'FROM member_system_notifications s WHERE s.recipient_id=?';
   const book="SELECT b.id,NULL AS actor_id,'HAVANA NICE' AS display_name,b.kind,"+
    "b.target_id,'' AS emoji,b.preview,b.created_at,b.read_at "+
    'FROM book_member_notifications b WHERE b.recipient_id=?';
   try{
    const query='SELECT * FROM ('+base+' UNION ALL '+calendar+
     ' UNION ALL '+system+' UNION ALL '+book+
     ') ORDER BY created_at DESC,id DESC LIMIT 60';
    rows=(await env.DB.prepare(query).bind(actor.actorId,actor.actorId,actor.actorId,actor.actorId).all()).results||[];
    const [calendarCount,systemCount,bookCount]=await Promise.all([
     env.DB.prepare('SELECT COUNT(*) AS total FROM calendar_member_notifications '+
      'WHERE recipient_id=? AND read_at IS NULL').bind(actor.actorId).first(),
     env.DB.prepare('SELECT COUNT(*) AS total FROM member_system_notifications '+
      'WHERE recipient_id=? AND read_at IS NULL').bind(actor.actorId).first(),
     env.DB.prepare('SELECT COUNT(*) AS total FROM book_member_notifications '+
      'WHERE recipient_id=? AND read_at IS NULL').bind(actor.actorId).first()
    ]);
    calendarUnread=Number(calendarCount?.total||0);
    systemUnread=Number(systemCount?.total||0);
    bookUnread=Number(bookCount?.total||0);
   }catch{
    // Roll back to the original three-way inbox if BOOK migration is absent.
    try{
     rows=(await env.DB.prepare(
      'SELECT * FROM ('+base+' UNION ALL '+calendar+' UNION ALL '+system+
      ') ORDER BY created_at DESC,id DESC LIMIT 60'
     ).bind(actor.actorId,actor.actorId,actor.actorId).all()).results||[];
     const [cc,sc]=await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS total FROM calendar_member_notifications WHERE recipient_id=? AND read_at IS NULL').bind(actor.actorId).first(),
      env.DB.prepare('SELECT COUNT(*) AS total FROM member_system_notifications WHERE recipient_id=? AND read_at IS NULL').bind(actor.actorId).first()
     ]);
     calendarUnread=Number(cc?.total||0);
     systemUnread=Number(sc?.total||0);
    }catch{
     // A partially migrated database keeps the older Chat + Calendar inbox.
     try{
     const query='SELECT * FROM ('+base+' UNION ALL '+calendar+
      ') ORDER BY created_at DESC,id DESC LIMIT 60';
     rows=(await env.DB.prepare(query).bind(actor.actorId,actor.actorId).all()).results||[];
     const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM calendar_member_notifications '+
      'WHERE recipient_id=? AND read_at IS NULL').bind(actor.actorId).first();
     calendarUnread=Number(count?.total||0);
     }catch{
      rows=(await env.DB.prepare(base+' ORDER BY n.created_at DESC,n.id DESC LIMIT 60')
       .bind(actor.actorId).all()).results||[];
     }
    }
   }
   const unread=await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM member_notifications '+
    'WHERE recipient_id=? AND read_at IS NULL'
   ).bind(actor.actorId).first();
   return asJson({items:rows.map(row=>({
    id:row.id,actorId:row.actor_id||'',name:row.display_name,
    kind:row.kind,targetId:row.target_id,emoji:row.emoji,preview:row.preview,
    createdAt:row.created_at,readAt:row.read_at
   })),unread:Number(unread?.total||0)+calendarUnread+systemUnread+bookUnread},200,origin);
  }
  if(url.pathname==='/api/notices/read'&&request.method==='POST'){
   let data;
   try{data=await request.json();}catch{return asJson({error:'Solicitud inválida.'},400,origin);}
   const id=data?.id;
   if(id!==null&&id!==undefined&&(typeof id!=='string'||!UUID.test(id)))
    return asJson({error:'Notificación inválida.'},400,origin);
   const now=Date.now();
   if(id){
    await env.DB.prepare('UPDATE member_notifications SET read_at=? '+
     'WHERE id=? AND recipient_id=? AND read_at IS NULL').bind(now,id,actor.actorId).run();
    try{await env.DB.prepare('UPDATE calendar_member_notifications SET read_at=? '+
     'WHERE id=? AND recipient_id=? AND read_at IS NULL').bind(now,id,actor.actorId).run();}
    catch{/* Old schema remains readable. */}
    try{await env.DB.prepare('UPDATE member_system_notifications SET read_at=? '+
     'WHERE id=? AND recipient_id=? AND read_at IS NULL').bind(now,id,actor.actorId).run();}
    catch{/* A missing optional migration cannot block other notices. */}
    try{await env.DB.prepare('UPDATE book_member_notifications SET read_at=? '+
     'WHERE id=? AND recipient_id=? AND read_at IS NULL').bind(now,id,actor.actorId).run();}
    catch{/* A missing optional migration cannot block other notices. */}
   }else{
    await env.DB.prepare('UPDATE member_notifications SET read_at=? '+
     'WHERE recipient_id=? AND read_at IS NULL').bind(now,actor.actorId).run();
    try{await env.DB.prepare('UPDATE calendar_member_notifications SET read_at=? '+
     'WHERE recipient_id=? AND read_at IS NULL').bind(now,actor.actorId).run();}
    catch{/* Old schema remains readable. */}
    try{await env.DB.prepare('UPDATE member_system_notifications SET read_at=? '+
     'WHERE recipient_id=? AND read_at IS NULL').bind(now,actor.actorId).run();}
    catch{/* A missing optional migration cannot block other notices. */}
    try{await env.DB.prepare('UPDATE book_member_notifications SET read_at=? '+
     'WHERE recipient_id=? AND read_at IS NULL').bind(now,actor.actorId).run();}
    catch{/* A missing optional migration cannot block other notices. */}
   }
   return asJson({ok:true},200,origin);
  }
  return asJson({error:'Método no permitido.'},405,origin);
 }catch{
  return asJson({error:'Notificaciones aún no disponibles.'},503,origin);
 }
}
