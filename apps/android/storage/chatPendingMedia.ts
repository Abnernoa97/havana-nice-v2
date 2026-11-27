// Private, isolated V2 attachment queue. Never touch the session/outbox key,
// Google Drive, R2, or existing chatPhotoCache. The app owns its pending files.
import Storage from 'expo-sqlite/kv-store';
import {File,Paths} from 'expo-file-system';
import {
 CHAT_MEDIA_MAX_PER_SEND,validateChatMediaSelection,type ChatMediaSelection,
} from '@havana/shared';

export type PendingNativeChatMedia=ChatMediaSelection&{id:string};
type Stored={actorId:string;updatedAt:number;items:readonly PendingNativeChatMedia[]};
const KEY='hn-v2-chat-media-draft-v1';
const TTL=24*60*60*1000;
const COPY_BUDGET=80*1024*1024; // photos only
const VIDEO_FREE_SPACE_RESERVE=64*1024*1024;
const PREFIX='hn-v2-chat-pending-';
const ORPHAN_TTL=48*60*60*1000;
let lastSweep=0;
// Cleanup is narrowly limited to old staging files owned by this feature.
function pruneExpiredNativeChatStaging(){
 const now=Date.now();
 if(now-lastSweep<24*60*60*1000)return;
 lastSweep=now;
 try{
   for(const entry of Paths.document.list()){
     if(!(entry instanceof File)||!entry.name.startsWith(PREFIX))continue;
     const age=entry.modificationTime===null?0:now-entry.modificationTime;
     if(age>ORPHAN_TTL)entry.delete();
   }
 }catch{/* Storage may be unavailable; never touch other directories. */}
}

export function isNativePendingStaged(item:PendingNativeChatMedia):boolean{
 const root=Paths.document.uri.replace(/\/$/,'')+'/';
 return item.uri.startsWith(root+PREFIX);
}
function removeStagedFile(item:PendingNativeChatMedia){
 if(!isNativePendingStaged(item))return;
 try{const file=new File(item.uri);if(file.exists)file.delete();}catch{}
}
export function discardNativePendingMedia(item:PendingNativeChatMedia):void{
 removeStagedFile(item);
}
export async function storeNativePendingMedia(actorId:string,items:readonly PendingNativeChatMedia[]):Promise<void>{
 if(!actorId)return;
 if(!items.length){await Storage.removeItem(KEY);return;}
 await Storage.setItem(KEY,JSON.stringify({actorId,updatedAt:Date.now(),items} satisfies Stored));
}
export async function loadNativePendingMedia(actorId:string):Promise<PendingNativeChatMedia[]>{
 pruneExpiredNativeChatStaging();
 if(!actorId)return [];
 const raw=await Storage.getItem(KEY);
 if(!raw)return [];
 try{
   const data=JSON.parse(raw) as Stored;
   if(data.actorId!==actorId||!Number.isFinite(data.updatedAt)||
      Date.now()-data.updatedAt>TTL||!Array.isArray(data.items)||
      data.items.length>CHAT_MEDIA_MAX_PER_SEND){
     if(Array.isArray(data.items))for(const item of data.items)removeStagedFile(item);
     await Storage.removeItem(KEY);
     return [];
   }
   const valid=data.items.filter(item=>{
     if(!item||validateChatMediaSelection(item)!==null)return false;
     try{const file=new File(item.uri);return file.exists&&file.size===item.sizeBytes;}catch{return false;}
   });
   if(valid.length!==data.items.length)
     await storeNativePendingMedia(actorId,valid);
   return valid;
 }catch{await Storage.removeItem(KEY);return [];}
}
// Large video originals are not subject to the small photo draft budget.
// Native asynchronous disk copy; never decode or load the video into JS memory.
export async function stageNativePendingVideo(item:PendingNativeChatMedia,current:()=>boolean):Promise<PendingNativeChatMedia>{
 if(item.kind!=='video'||!current())throw Error('Selección cancelada.');
 const source=new File(item.uri);
 if(!source.exists||source.size!==item.sizeBytes||source.size<=0)
  throw Error('No se puede leer el video original. Elígelo de nuevo desde la galería.');
 if(isNativePendingStaged(item))return item;
 if(Paths.availableDiskSpace<item.sizeBytes+VIDEO_FREE_SPACE_RESERVE)
  throw Error('No hay espacio libre suficiente para proteger este video.');
 const id=item.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,70);
 const extension=item.mimeType==='video/quicktime'?'.mov':'.mp4';
 const destination=new File(Paths.document,PREFIX+id+extension);
 try{
  await source.copy(destination);
  if(!current())throw Error('Selección cancelada.');
  if(!destination.exists||destination.size!==item.sizeBytes)throw Error('La copia del video quedó incompleta.');
  return {...item,uri:destination.uri};
 }catch(error){
  try{if(destination.exists)destination.delete();}catch{}
  throw error;
 }
}
export async function preserveNativePendingMedia(
 items:readonly PendingNativeChatMedia[],existingBytes=0
):Promise<{items:PendingNativeChatMedia[];uncopied:boolean}>{
 const result:PendingNativeChatMedia[]=[];
 let copiedBytes=existingBytes+items.filter(item=>item.kind==='photo'&&isNativePendingStaged(item)).reduce((sum,item)=>sum+item.sizeBytes,0);
 let uncopied=false;
 for(const item of items){
   if(isNativePendingStaged(item)){result.push(item);continue;}
   // Video is staged before admission by the single selection lane.
   if(item.kind==='video'){result.push(item);uncopied=true;continue;}
   if(copiedBytes+item.sizeBytes>COPY_BUDGET){
     result.push(item);uncopied=true;continue;
   }
   const extension=item.mimeType==='image/heic'?'.heic':
     item.mimeType==='image/heif'?'.heif':
     item.mimeType==='image/png'?'.png':
     item.mimeType==='image/webp'?'.webp':'.jpg';
   const id=item.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,70);
   const destination=new File(Paths.document,PREFIX+id+extension);
   try{
     await new File(item.uri).copy(destination);
     if(!destination.exists||destination.size!==item.sizeBytes)
       throw Error('Copia incompleta');
     result.push({...item,uri:destination.uri});
     copiedBytes+=item.sizeBytes;
   }catch{
     try{if(destination.exists)destination.delete();}catch{}
     result.push(item);uncopied=true;
   }
 }
 return {items:result,uncopied};
}
export async function clearNativePendingMedia():Promise<void>{
 const raw=await Storage.getItem(KEY);
 if(raw){
   try{const stored=JSON.parse(raw) as Stored;
     if(Array.isArray(stored.items))for(const item of stored.items)removeStagedFile(item);
   }catch{}
 }
 await Storage.removeItem(KEY);
}
