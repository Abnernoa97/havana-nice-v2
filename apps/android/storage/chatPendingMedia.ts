// Private, isolated V2 attachment queue. Never touch the session/outbox key,
// Google Drive, R2, or existing chatPhotoCache. The app owns its pending files.
import Storage from 'expo-sqlite/kv-store';
import {File,Paths} from 'expo-file-system';
import {
 CHAT_MEDIA_MAX_PER_SEND,validateChatMediaSelection,type ChatMediaSelection,
} from '@havana/shared';

export type PendingNativeChatMedia=ChatMediaSelection&{id:string};
type Stored={actorId:string;updatedAt:number;items:PendingNativeChatMedia[]};
const KEY='hn-v2-chat-media-draft-v1';
const TTL=24*60*60*1000;
const COPY_BUDGET=80*1024*1024;
const PREFIX='hn-v2-chat-pending-';

function stagedFile(item:PendingNativeChatMedia):boolean{
 const root=Paths.document.uri.replace(/\/$/,'')+'/';
 return item.uri.startsWith(root+PREFIX);
}
function removeStagedFile(item:PendingNativeChatMedia){
 if(!stagedFile(item))return;
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
export async function preserveNativePendingMedia(
 items:readonly PendingNativeChatMedia[]
):Promise<{items:PendingNativeChatMedia[];uncopied:boolean}>{
 const result:PendingNativeChatMedia[]=[];
 let copiedBytes=0;
 let uncopied=false;
 for(const item of items){
   if(stagedFile(item)){result.push(item);continue;}
   if(copiedBytes+item.sizeBytes>COPY_BUDGET){
     result.push(item);uncopied=true;continue;
   }
   const extension=item.mimeType==='image/heic'?'.heic':
     item.mimeType==='image/heif'?'.heif':
     item.mimeType==='image/png'?'.png':
     item.mimeType==='image/webp'?'.webp':
     item.mimeType==='video/quicktime'?'.mov':
     item.kind==='video'?'.mp4':'.jpg';
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
