// One canonical text-message deletion path for Admin and musician Chat.
export async function deleteChatMessageRecord(env,seq){
 if(!Number.isSafeInteger(seq)||seq<=0)throw new Error('Invalid message sequence');
 const row=await env.DB.prepare('SELECT seq FROM chat_messages WHERE seq=?').bind(seq).first();
 const media=(await env.DB.prepare('SELECT id,object_key FROM chat_media_objects WHERE message_seq=?')
  .bind(seq).all()).results||[];
 if(!row)return false;
 await env.DB.batch([
  env.DB.prepare('UPDATE chat_messages SET reply_to_seq=NULL WHERE reply_to_seq=?').bind(seq),
  env.DB.prepare('DELETE FROM chat_reactions WHERE message_seq=?').bind(seq),
  env.DB.prepare('DELETE FROM chat_messages WHERE seq=?').bind(seq)
 ]);
 const check=await env.DB.prepare('SELECT seq FROM chat_messages WHERE seq=?').bind(seq).first();
 for(const item of media){
  await env.DB.prepare('DELETE FROM chat_media_objects WHERE id=? AND message_seq IS NULL')
   .bind(item.id).run();
  if(env.MEDIA_BUCKET){
   await env.MEDIA_BUCKET.delete(item.object_key).catch(()=>{});
   await env.MEDIA_BUCKET.delete(item.object_key+'.poster.jpg').catch(()=>{});
  }
 }
 if(check)throw new Error('Deletion not confirmed');
 return true;
}
