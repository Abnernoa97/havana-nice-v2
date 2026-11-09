// Private, bounded photo previews. Originals remain in R2; no signed URL,
// raw session token, or original-quality photo enters IndexedDB.
import type {ChatMedia} from './chat-media-types';

export const CHAT_PREVIEW_MEMORY_LIMIT_BYTES=16*1024*1024;
export const CHAT_PREVIEW_DISK_LIMIT_BYTES=48*1024*1024;
export const CHAT_PREVIEW_DISK_MAX_ITEMS=80;
export const CHAT_PREVIEW_TTL_MS=14*24*60*60*1000;
const MAX_ITEM_BYTES=8*1024*1024;
const DB_NAME='havana-v2-chat-photo-previews';
const STORE='previews';
type Photo=Pick<ChatMedia,'assetId'|'sizeBytes'>;
type RecordValue={blob:Blob;storedAt:number};
const memory=new Map<string,Blob>();
let memoryBytes=0;
let databasePromise:Promise<IDBDatabase|null>|null=null;
let writes=0;

function memoryKey(token:string,media:Photo):string{
 return token+'|'+media.assetId+':'+media.sizeBytes;
}
export function peekChatPhotoPreview(token:string,media:Photo):Blob|null{
 const key=memoryKey(token,media),value=memory.get(key);
 if(!value)return null;
 // Refresh memory LRU without keeping any blob: URL alive.
 memory.delete(key);memory.set(key,value);
 return value;
}
export function rememberChatPhotoPreview(token:string,media:Photo,blob:Blob):void{
 if(blob.size<=0||blob.size>MAX_ITEM_BYTES)return;
 const key=memoryKey(token,media),old=memory.get(key);
 if(old){memory.delete(key);memoryBytes-=old.size;}
 memory.set(key,blob);memoryBytes+=blob.size;
 while(memoryBytes>CHAT_PREVIEW_MEMORY_LIMIT_BYTES){
  const eldest=memory.keys().next().value;
  if(eldest===undefined)break;
  const removed=memory.get(eldest);
  if(removed)memoryBytes-=removed.size;
  memory.delete(eldest);
 }
}
async function storageKey(token:string,media:Photo):Promise<string|null>{
 if(!token||!globalThis.crypto?.subtle)return null;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const scope=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return scope+':'+media.assetId+':'+media.sizeBytes;
}
function openDatabase():Promise<IDBDatabase|null>{
 if(typeof indexedDB==='undefined')return Promise.resolve(null);
 if(databasePromise)return databasePromise;
 databasePromise=new Promise(resolve=>{
  try{
   const request=indexedDB.open(DB_NAME,1);
   request.onupgradeneeded=()=>{
    if(!request.result.objectStoreNames.contains(STORE))
     request.result.createObjectStore(STORE);
   };
   request.onsuccess=()=>{
    request.result.onversionchange=()=>{request.result.close();databasePromise=null;};
    resolve(request.result);
   };
   request.onerror=()=>resolve(null);
   request.onblocked=()=>resolve(null);
  }catch{resolve(null);}
 });
 return databasePromise;
}
function readFromStore(db:IDBDatabase,key:string):Promise<RecordValue|null>{
 return new Promise(resolve=>{
  try{
   const tx=db.transaction(STORE,'readonly');
   const request=tx.objectStore(STORE).get(key);
   request.onsuccess=()=>resolve(request.result??null);
   request.onerror=()=>resolve(null);
   tx.onabort=()=>resolve(null);
  }catch{resolve(null);}
 });
}
export async function loadChatPhotoPreview(token:string,media:Photo):Promise<Blob|null>{
 const inMemory=peekChatPhotoPreview(token,media);
 if(inMemory)return inMemory;
 try{
  const key=await storageKey(token,media);
  if(!key)return null;
  const db=await openDatabase();
  if(!db)return null;
  const record=await readFromStore(db,key);
  if(!record||!(record.blob instanceof Blob)||record.blob.size<=0||
     record.blob.size>MAX_ITEM_BYTES||Date.now()-record.storedAt>CHAT_PREVIEW_TTL_MS)return null;
  rememberChatPhotoPreview(token,media,record.blob);
  return record.blob;
 }catch{return null;}
}
async function pruneOldPreviews(db:IDBDatabase):Promise<void>{
 try{
  const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);
  const entries:Array<{key:IDBValidKey;storedAt:number;bytes:number}>=[];
  store.openCursor().onsuccess=event=>{
   const cursor=(event.target as IDBRequest<IDBCursorWithValue|null>).result;
   if(cursor){
    const record=cursor.value as RecordValue;
    entries.push({key:cursor.key,storedAt:record?.storedAt??0,bytes:record?.blob?.size??0});
    cursor.continue();return;
   }
   entries.sort((a,b)=>b.storedAt-a.storedAt);
   let bytes=0,count=0;
   for(const entry of entries){
    if(Date.now()-entry.storedAt>CHAT_PREVIEW_TTL_MS||
       ++count>CHAT_PREVIEW_DISK_MAX_ITEMS||
       (bytes+=entry.bytes)>CHAT_PREVIEW_DISK_LIMIT_BYTES)
      store.delete(entry.key);
   }
  };
 }catch{/* Browser storage is best effort. */}
}
export async function storeChatPhotoPreview(token:string,media:Photo,blob:Blob):Promise<void>{
 rememberChatPhotoPreview(token,media,blob);
 if(blob.size<=0||blob.size>MAX_ITEM_BYTES)return;
 try{
  const key=await storageKey(token,media);
  if(!key)return;
  const db=await openDatabase();
  if(!db)return;
  await new Promise<void>(resolve=>{
   try{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put({blob,storedAt:Date.now()} satisfies RecordValue,key);
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>resolve();
    tx.onabort=()=>resolve();
   }catch{resolve();}
  });
  if(++writes%6===0)void pruneOldPreviews(db);
 }catch{/* Quota/private mode failure must never block Chat photos. */}
}
