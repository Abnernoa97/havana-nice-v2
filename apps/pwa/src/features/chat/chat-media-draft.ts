import {
 CHAT_MEDIA_MAX_PER_SEND,validateChatMediaSelection,
 type ChatMediaKind,type ChatMediaSource,
} from '@havana/shared';

// Short-lived recovery stores only photo files; never full MOV/MP4 originals.
// Keep Chat session, service worker, localStorage and R2 records separate.
const DATABASE='havana-v2-pending-chat-attachments';
const STORE='pending';
const KEY='one-current-draft';
const TTL_MS=24*60*60*1000;
export const PWA_MEDIA_DRAFT_MAX_BYTES=80*1024*1024;

export type StoredChatMediaItem={
 id:string;
 file:File;
 kind:ChatMediaKind;
 source:ChatMediaSource;
 name:string;
 mimeType:string;
 sizeBytes:number;
};
type DraftRecord={actorId:string;updatedAt:number;items:StoredChatMediaItem[]};

function openDatabase():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
   const request=indexedDB.open(DATABASE,1);
   request.onupgradeneeded=()=>{
     if(!request.result.objectStoreNames.contains(STORE))
       request.result.createObjectStore(STORE);
   };
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error||Error('Almacenamiento temporal no disponible.'));
 });
}
async function transaction<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore,resolve:(value:T)=>void)=>void):Promise<T>{
 const db=await openDatabase();
 try{
   return await new Promise<T>((resolve,reject)=>{
     const tx=db.transaction(STORE,mode);
     let result!:T;
     tx.oncomplete=()=>resolve(result);
     tx.onerror=()=>reject(tx.error||Error('Almacenamiento temporal no disponible.'));
     tx.onabort=()=>reject(tx.error||Error('Guardado interrumpido.'));
     action(tx.objectStore(STORE),(value:T)=>{result=value;});
   });
 }finally{db.close();}
}
export async function clearChatMediaDraft():Promise<void>{
 await transaction<void>('readwrite',store=>{store.delete(KEY);});
}
export async function saveChatMediaDraft(actorId:string,items:readonly StoredChatMediaItem[]):Promise<'saved'|'too-large'>{
 if(!actorId)throw Error('Sesión no disponible.');
 const photos=items.filter(item=>item.kind==='photo');
 if(!photos.length){await clearChatMediaDraft();return 'saved';}
 const total=photos.reduce((sum,item)=>sum+item.sizeBytes,0);
 if(photos.length>CHAT_MEDIA_MAX_PER_SEND||total>PWA_MEDIA_DRAFT_MAX_BYTES){
   await clearChatMediaDraft();
   return 'too-large';
 }
 const record:DraftRecord={actorId,updatedAt:Date.now(),items:[...photos]};
 await transaction<void>('readwrite',store=>{store.put(record,KEY);});
 return 'saved';
}
export async function loadChatMediaDraft(actorId:string):Promise<StoredChatMediaItem[]>{
 if(!actorId)return [];
 const record=await transaction<DraftRecord|undefined>('readonly',(store,setResult)=>{
   const request=store.get(KEY);
   request.onsuccess=()=>setResult(request.result as DraftRecord|undefined);
 });
 if(!record)return [];
 if(record.actorId!==actorId||Date.now()-record.updatedAt>TTL_MS||
    !Array.isArray(record.items)||record.items.length>CHAT_MEDIA_MAX_PER_SEND){
   await clearChatMediaDraft();return [];
 }
 if(record.items.some(item=>
    !item||!item.id||!(item.file instanceof Blob)||
    item.file.size!==item.sizeBytes||
    validateChatMediaSelection(item)!==null)){
   await clearChatMediaDraft();return [];
 }
 // Older PWA versions may have saved video blobs. Migrate them out once.
 const photos=record.items.filter(item=>item.kind==='photo');
 if(photos.length!==record.items.length)
   void saveChatMediaDraft(actorId,photos).catch(()=>{});
 return photos;
}
