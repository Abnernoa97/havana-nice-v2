// Private per-member inbox. One existing musician session; no new socket or credentials.
// Notifications contain short metadata, never private media URLs or tokens.
const asJson=(value,status,origin)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private,no-store',
 'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev','vary':'Origin'}
});
const UUID=/^[a-f0-9-]{36}$/i;

// Future modules use this single emitter. The actor and recipient are derived
// from server-owned records, never from user-supplied notification recipients.
export async function notifyMember(env,{recipientId,actorId,kind,targetId,emoji='',preview='',dedupeKey=null}){
 if(!recipientId||!actorId||recipientId===actorId)return false;
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
