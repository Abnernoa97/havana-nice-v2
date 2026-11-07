// HAVANA NICE V2 · single R2 cross-module storage budget; 10 GB-month free is not a billing kill switch.
// Decimal GB: cap Family originals/posters, Chat ready originals and all reservations at 9.5 GB.
export const FAMILY_STORAGE_STOP_BYTES=9_500_000_000;
export const FAMILY_STORAGE_WARNING_BYTES=9_000_000_000;
const UNKNOWN_POSTER_ESTIMATE=384*1024;
const USAGE_SQL=`(SELECT COALESCE(SUM(size_bytes + CASE
 WHEN poster_key IS NULL THEN 0
 WHEN poster_size_bytes>0 THEN poster_size_bytes
 ELSE ${UNKNOWN_POSTER_ESTIMATE} END),0) FROM family_media)`;
const CHAT_SQL=`(SELECT COALESCE(SUM(size_bytes),0) FROM chat_media_objects WHERE status='ready')`;
// Count private R2 bytes until post-deletion cleanup has really completed.
const MEMBER_DELETE_PENDING_SQL=`(SELECT COALESCE(SUM(size_bytes),0) FROM r2_member_delete_queue)`;
const GLOBAL_SQL=USAGE_SQL+'+'+CHAT_SQL+'+'+MEMBER_DELETE_PENDING_SQL;
const ACTIVE_SQL=`(SELECT COALESCE(SUM(size_bytes),0) FROM family_upload_sessions)`;
const RESERVED_SQL=`(SELECT COALESCE(SUM(size_bytes),0) FROM family_upload_reservations)`;

/** Never confuse completed R2 media with reserved/in-flight multipart bytes. */
export async function familyStorageUsage(env){
 const row=await env.DB.prepare('SELECT '+GLOBAL_SQL+' AS used_bytes,'+
  ACTIVE_SQL+'+'+RESERVED_SQL+' AS pending_bytes').first();
 const usedBytes=Number(row?.used_bytes||0);
 const pendingBytes=Number(row?.pending_bytes||0);
 const occupied=usedBytes+pendingBytes;
 return {usedBytes,pendingBytes,maxBytes:FAMILY_STORAGE_STOP_BYTES,
  warningBytes:FAMILY_STORAGE_WARNING_BYTES,
  remainingBytes:Math.max(0,FAMILY_STORAGE_STOP_BYTES-occupied),
  warning:occupied>=FAMILY_STORAGE_WARNING_BYTES,
  stopped:occupied>=FAMILY_STORAGE_STOP_BYTES};
}
/** One conditional SQLite INSERT is an atomic cross-request quota reservation.
 * Never remove reservations before the original is persisted (or has failed). */
export async function reserveFamilyStorage(env,bytes,id=crypto.randomUUID()){
 if(!Number.isSafeInteger(bytes)||bytes<=0||bytes>FAMILY_STORAGE_STOP_BYTES)return null;
 await env.DB.prepare('DELETE FROM family_upload_reservations WHERE expires_at<?')
  .bind(Date.now()).run();
 const sql='INSERT INTO family_upload_reservations(id,size_bytes,expires_at) '+
  'SELECT ?,?,? WHERE '+GLOBAL_SQL+'+'+ACTIVE_SQL+'+'+RESERVED_SQL+'+? <= ?';
 await env.DB.prepare(sql).bind(id,bytes,Date.now()+6*60*60*1000,
  bytes,FAMILY_STORAGE_STOP_BYTES).run();
 const reserved=await env.DB.prepare('SELECT id FROM family_upload_reservations WHERE id=?')
  .bind(id).first();
 return reserved?id:null;
}
export async function releaseFamilyStorage(env,id){
 await env.DB.prepare('DELETE FROM family_upload_reservations WHERE id=?').bind(id).run();
}
