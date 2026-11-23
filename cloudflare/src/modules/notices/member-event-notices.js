// HAVANA NICE V2 - Private actions between approved musicians.
// Keep event-specific recipient selection separate from inbox HTTP and Admin systems.
import {sha256Hex} from '../../shared/crypto-helpers.js';
import {queueNoticePush} from './push-center.js';
import {memberPushCopy} from './push-copy.js';

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

// Publishing a State is a real team event; the author never alerts themselves.
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

