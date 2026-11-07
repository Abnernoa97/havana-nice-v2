// Durable cleanup for the one V2 R2 bucket after a member is removed.
// D1 member deletion and object-key enqueuing form ONE atomic DB.batch.
// Never drop a queue row unless R2 confirmed deletion/abort (404 already absent).
function alreadyAbsent(error){
 const message=String(error?.message||error||'');
 return error?.status===404 || error?.code===404 ||
   /NoSuchUpload|NoSuchKey|not found|404/i.test(message);
}
export async function cleanupMemberMedia(env,actorId,limit=80){
 if(!env.MEDIA_BUCKET)return {cleaned:0,pending:null};
 const rows=(await env.DB.prepare(
  'SELECT object_key,multipart_upload_id FROM r2_member_delete_queue '+
  'WHERE actor_id=? ORDER BY queued_at,object_key LIMIT ?'
 ).bind(actorId,limit).all()).results||[];
 let cleaned=0;
 // At most four simultaneous R2 operations; no additional upload engine.
 for(let i=0;i<rows.length;i+=4){
  const results=await Promise.all(rows.slice(i,i+4).map(async row=>{
   try{
    if(row.multipart_upload_id){
     try{
      await env.MEDIA_BUCKET.resumeMultipartUpload(row.object_key,row.multipart_upload_id).abort();
     }catch(error){
      if(!alreadyAbsent(error))throw error;
     }
    }else{
     await env.MEDIA_BUCKET.delete(row.object_key);
    }
    await env.DB.prepare(
     'DELETE FROM r2_member_delete_queue WHERE actor_id=? AND object_key=?'
    ).bind(actorId,row.object_key).run();
    return true;
   }catch{return false;} // Keep the durable queue for a safe retry.
  }));
  cleaned+=results.filter(Boolean).length;
 }
 const pending=await env.DB.prepare(
  'SELECT COUNT(*) AS remaining FROM r2_member_delete_queue WHERE actor_id=?'
 ).bind(actorId).first();
 return {cleaned,pending:Number(pending?.remaining||0)};
}
export async function pendingMemberMedia(env,actorId){
 const row=await env.DB.prepare(
  'SELECT COUNT(*) AS remaining FROM r2_member_delete_queue WHERE actor_id=?'
 ).bind(actorId).first();
 return Number(row?.remaining||0);
}
