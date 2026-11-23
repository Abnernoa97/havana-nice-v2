// HAVANA NICE V2 - One stable import path for all producers and consumers.
// Internal responsibilities: member-event-notices (people),
// member-system-notices (Admin), this module (private inbox HTTP).
// Keep this entrypoint compatible with existing Chat/States/Calendar/BOOK.
export {notifyMember,notifyTeamActivity,notifyTeamProfilePhoto,notifyTeamFamilyMedia,
 notifyTeamStoryPublished,notifyTeamChatMessage,notifyChatReaction,notifyStoryOwner}
 from './member-event-notices.js';
export {notifyRepertoireMembers,notifyGeneralRepertoireMembers,notifyBookPublished,
 notifyCalendarMembers} from './member-system-notices.js';

// Private per-member inbox. One existing musician session; no new socket or credentials.
// Notifications contain short metadata, never private media URLs or tokens.
const asJson=(value,status,origin)=>new Response(JSON.stringify(value),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private,no-store',
 'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev','vary':'Origin'}
});
const UUID=/^[a-f0-9-]{36}$/i;

// REST endpoint for the one authenticated private inbox.
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
