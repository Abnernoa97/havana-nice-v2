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

export async function handleMemberNotices(request,env,url,origin,verifySession){
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const actor=await verifySession(env,token);
 if(!actor)return asJson({error:'No autorizado.'},401,origin);
 try{
  if(url.pathname==='/api/notices'&&request.method==='GET'){
   const rows=(await env.DB.prepare(
    'SELECT n.id,n.actor_id,a.display_name,n.kind,n.target_id,n.emoji,'+
    'n.preview,n.created_at,n.read_at FROM member_notifications n '+
    'JOIN chat_members a ON a.actor_id=n.actor_id '+
    'WHERE n.recipient_id=? ORDER BY n.created_at DESC,n.id DESC LIMIT 60'
   ).bind(actor.actorId).all()).results||[];
   const unread=await env.DB.prepare(
    'SELECT COUNT(*) AS total FROM member_notifications '+
    'WHERE recipient_id=? AND read_at IS NULL'
   ).bind(actor.actorId).first();
   return asJson({items:rows.map(row=>({
    id:row.id,actorId:row.actor_id,name:row.display_name,
    kind:row.kind,targetId:row.target_id,emoji:row.emoji,preview:row.preview,
    createdAt:row.created_at,readAt:row.read_at
   })),unread:Number(unread?.total||0)},200,origin);
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
   }else{
    await env.DB.prepare('UPDATE member_notifications SET read_at=? '+
     'WHERE recipient_id=? AND read_at IS NULL').bind(now,actor.actorId).run();
   }
   return asJson({ok:true},200,origin);
  }
  return asJson({error:'Método no permitido.'},405,origin);
 }catch{
  return asJson({error:'Notificaciones aún no disponibles.'},503,origin);
 }
}
