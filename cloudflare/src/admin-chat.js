// The authenticated administrator moderates the same D1 room as musicians.
import {verifyAdminSession} from './admin-auth.js';
import {deleteChatMessageRecord} from './message-removal.js';
import {decorateChatMessages} from './chat-media.js';
const MAX_HISTORY=100,ROOM='main-chat-v2';
const COLUMNS='seq,client_message_id,sender_id,sender_name,body,created_at,reply_to_seq,edited_at,deleted_at';
function mapped(row){
 return {seq:row.seq,clientMessageId:row.client_message_id,senderId:row.sender_id,
 senderName:row.sender_name,text:row.body,sentAt:row.created_at,
 replyToSeq:row.reply_to_seq??null,editedAt:row.edited_at??null,deletedAt:null};
}
export async function handleAdminChat(request,env,url,origin,respond){
 const reply=(data,status=200)=>respond(data,status,origin);
 if(!await verifyAdminSession(request,env))return reply({error:'No autorizado'},401);
 if(url.pathname==='/api/chat/admin/messages'&&request.method==='GET'){
  const raw=url.searchParams.get('beforeSeq'),before=raw===null?null:Number(raw);
  if(before!==null&&(!Number.isSafeInteger(before)||before<1))return reply({error:'Cursor inválido'},400);
  const query=before===null?
   env.DB.prepare('SELECT '+COLUMNS+' FROM chat_messages WHERE deleted_at IS NULL ORDER BY seq DESC LIMIT ?').bind(MAX_HISTORY):
   env.DB.prepare('SELECT '+COLUMNS+' FROM chat_messages WHERE seq<? AND deleted_at IS NULL ORDER BY seq DESC LIMIT ?').bind(before,MAX_HISTORY);
  const rows=(await query.all()).results||[], ids=rows.map(x=>x.seq);
  let reactions=[];
  if(ids.length){
   const query=await env.DB.prepare('SELECT message_seq,actor_id,emoji FROM chat_reactions WHERE message_seq IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all();
   reactions=(query.results||[]).map(x=>({messageSeq:x.message_seq,actorId:x.actor_id,emoji:x.emoji}));
  }
  return reply({messages:await decorateChatMessages(env,rows.reverse().map(mapped)),reactions,hasMore:rows.length===MAX_HISTORY});
 }
 const match=/^\/api\/chat\/admin\/messages\/(\d+)$/.exec(url.pathname);
 if(!match||request.method!=='DELETE')return reply({error:'Ruta no válida'},404);
 const seq=Number(match[1]);
 if(!Number.isSafeInteger(seq)||seq<1)return reply({error:'Mensaje inválido'},400);
 const deleted=await deleteChatMessageRecord(env,seq);
 if(!deleted)return reply({error:'Mensaje no encontrado'},404);
 try{
  await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM)).fetch(
   'https://internal/admin-chat-message-deleted',
   {method:'POST',body:JSON.stringify({seq})});
 }catch{/* D1 authoritative; clients resync after reconnection. */}
 return reply({ok:true,seq});
}
