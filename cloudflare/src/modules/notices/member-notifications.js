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
 const response=await env.DB.prepare(
  'INSERT OR IGNORE INTO member_notifications '+
  '(id,recipient_id,actor_id,kind,target_id,emoji,preview,created_at,dedupe_key) '+
  'SELECT ?,r.actor_id,a.actor_id,?,?,?,?,?,? FROM chat_members r '+
  'JOIN chat_members a ON a.actor_id=? AND a.active=1 '+
  'WHERE r.actor_id=? AND r.active=1'
 ).bind(crypto.randomUUID(),String(kind).slice(0,60),String(targetId).slice(0,100),
  String(emoji).slice(0,12),String(preview).slice(0,160),now,dedupeKey,
  actorId,recipientId).run();
 return Number(response.meta?.changes||0)>0;
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
 ).all()).results||[];
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
 return notifyTeamActivity(env,actor.actorId,'profile.photo',photoKey,{
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

// New Android/PWA States are team activity, not a private author-only reply.
// Each published batch creates ONE notice per other authorized musician.
// The endpoint never trusts recipients supplied by the uploader.
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
 const statements=unique.map(recipient=>env.DB.prepare(
  'INSERT OR IGNORE INTO calendar_member_notifications '+
  '(id,recipient_id,kind,target_id,preview,created_at,dedupe_key) '+
  "SELECT ?,m.actor_id,'calendar.event',?,?,?,? FROM chat_members m "+
  'WHERE m.actor_id=? AND m.active=1'
 ).bind(crypto.randomUUID(),String(eventId),preview.slice(0,160),now,
  'calendar:'+String(eventId)+':'+String(revision)+':'+recipient,recipient));
 try{
  // A deployment without migration 0037 must not break Calendar edits.
  const results=await env.DB.batch(statements);
  return results.reduce((sum,result)=>sum+Number(result?.meta?.changes||0),0);
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
   let rows=[],calendarUnread=0;
   try{
    // One chronological inbox; system messages have no impersonated musician.
    const query='SELECT * FROM ('+base+' UNION ALL '+
     "SELECT c.id,NULL AS actor_id,'HAVANA NICE' AS display_name,c.kind,"+
     "c.target_id,'' AS emoji,c.preview,c.created_at,c.read_at "+
     'FROM calendar_member_notifications c WHERE c.recipient_id=?) '+
     'ORDER BY created_at DESC,id DESC LIMIT 60';
    rows=(await env.DB.prepare(query).bind(actor.actorId,actor.actorId).all()).results||[];
    const count=await env.DB.prepare('SELECT COUNT(*) AS total FROM calendar_member_notifications '+
     'WHERE recipient_id=? AND read_at IS NULL').bind(actor.actorId).first();
    calendarUnread=Number(count?.total||0);
   }catch{
    // Keep existing Story/Chat notices usable until D1 migration 0037 runs.
    rows=(await env.DB.prepare(base+' ORDER BY n.created_at DESC,n.id DESC LIMIT 60')
     .bind(actor.actorId).all()).results||[];
   }
   const unread=await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM member_notifications '+
    'WHERE recipient_id=? AND read_at IS NULL'
   ).bind(actor.actorId).first();
   return asJson({items:rows.map(row=>({
    id:row.id,actorId:row.actor_id||'',name:row.display_name,
    kind:row.kind,targetId:row.target_id,emoji:row.emoji,preview:row.preview,
    createdAt:row.created_at,readAt:row.read_at
   })),unread:Number(unread?.total||0)+calendarUnread},200,origin);
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
   }else{
    await env.DB.prepare('UPDATE member_notifications SET read_at=? '+
     'WHERE recipient_id=? AND read_at IS NULL').bind(now,actor.actorId).run();
    try{await env.DB.prepare('UPDATE calendar_member_notifications SET read_at=? '+
     'WHERE recipient_id=? AND read_at IS NULL').bind(now,actor.actorId).run();}
    catch{/* Old schema remains readable. */}
   }
   return asJson({ok:true},200,origin);
  }
  return asJson({error:'Método no permitido.'},405,origin);
 }catch{
  return asJson({error:'Notificaciones aún no disponibles.'},503,origin);
 }
}
