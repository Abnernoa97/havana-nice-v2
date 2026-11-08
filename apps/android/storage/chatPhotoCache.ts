import {File,Paths} from 'expo-file-system';
import type {ChatMessage} from '@havana/shared';
type Media=NonNullable<ChatMessage['media']>;

const MAX_ORIGINAL_IMAGE_BYTES=100*1024*1024;
const pendingPhotos=new Map<string,Promise<string>>();
const PARTIAL_TRANSFER_TTL=24*60*60*1000;
let lastPartialTransferSweep=0;

// Only remove incomplete V2 photo downloads that are at least a day old.
// Do not evict verified original photographs, drafts or other app caches.
function pruneAbandonedPhotoTransfers(){
 const now=Date.now();
 if(now-lastPartialTransferSweep<PARTIAL_TRANSFER_TTL)return;
 lastPartialTransferSweep=now;
 try{
  for(const entry of Paths.cache.list()){
   if(!(entry instanceof File)||!/^hn-v2-photo-transfer-[0-9a-f-]+-[0-9]+\.part$/.test(entry.name))continue;
   const modified=entry.modificationTime;
   if(modified!==null&&modified<=now-PARTIAL_TRANSFER_TTL){
    try{entry.delete();}catch{/* Cache cleanup is best effort. */}
   }
  }
 }catch{/* No cache permission or directory? Preserve Chat availability. */}
}

const identifier=(value:string)=>value.replace(/[^0-9a-f-]/gi,'').slice(0,36);
export const photoPath=(media:Media)=>{const ext=media.mimeType==='image/png'?'png':media.mimeType==='image/webp'?'webp':media.mimeType==='image/heic'||media.mimeType==='image/heif'?'heic':'jpg';return new File(Paths.cache,'hn-v2-chat-photo-'+identifier(media.assetId)+'-'+media.sizeBytes+'.'+ext);};

// The private app cache is best effort: no Google credentials, device tokens or
// private signed URLs are persisted. Complete originals are atomic on disk.
// A failed/partial download is NEVER opened as a photograph.
export async function cacheWholePhoto(media:Media,remoteUrl:string){
 if(media.sizeBytes<=0||media.sizeBytes>MAX_ORIGINAL_IMAGE_BYTES)
  throw Error('Fotografía no admitida');
 const key=identifier(media.assetId)+':'+media.sizeBytes;
 const existing=pendingPhotos.get(key);
 if(existing)return existing;
 const work=(async()=>{
  const cached=photoPath(media);
  if(cached.exists&&cached.size===media.sizeBytes)return cached.uri;
  if(cached.exists)cached.delete();
  pruneAbandonedPhotoTransfers();
  const temporary=new File(Paths.cache,'hn-v2-photo-transfer-'+identifier(media.assetId)+'-'+Date.now()+'.part');
  try{
   const finished=await File.downloadFileAsync(remoteUrl,temporary,{idempotent:true});
   if(!finished.exists||finished.size!==media.sizeBytes)
    throw Error('No se recibió la fotografía completa');
   await finished.move(cached);
   if(!cached.exists||cached.size!==media.sizeBytes)
    throw Error('No se verificó la fotografía original');
   return cached.uri;
  }catch(error){
   if(temporary.exists)temporary.delete();
   throw error;
  }
 })();
 pendingPhotos.set(key,work);
 try{return await work;}
 finally{if(pendingPhotos.get(key)===work)pendingPhotos.delete(key);}
}

