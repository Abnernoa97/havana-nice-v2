// A small, encrypted, per-musician image cache for iPhone PWA only.
// Never store grants, credentials or unencrypted private R2 media in IndexedDB.
// The encryption key is derived in memory from the existing authorized session.
const DB_NAME='havana-v2-private-images-v1';
const STORE='images';
const MAX_ENTRIES=120;
const MAX_BYTES=32*1024*1024;
const MAX_ITEM_BYTES=1_500_000;
type Row={id:string;iv:Uint8Array<ArrayBuffer>;payload:ArrayBuffer;mime:string;expiresAt:number;size:number;updatedAt:number};
type Hot={blob:Blob;expiresAt:number;usedAt:number};
const hot=new Map<string,Hot>();
const MAX_HOT=28;
let dbPromise:Promise<IDBDatabase|null>|undefined;
let writes=0;
const keys=new Map<string,Promise<{prefix:string;key:CryptoKey}>>();
const available=()=>typeof indexedDB!=='undefined'&&typeof crypto!=='undefined'&&!!crypto.subtle;
function open():Promise<IDBDatabase|null>{
 if(!available())return Promise.resolve(null);
 if(dbPromise)return dbPromise;
 dbPromise=new Promise(resolve=>{
  try{
   const request=indexedDB.open(DB_NAME,1);
   request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>resolve(null);
   request.onblocked=()=>resolve(null);
  }catch{resolve(null);}
 });
 return dbPromise;
}
function material(token:string):Promise<{prefix:string;key:CryptoKey}>{
 const previous=keys.get(token);if(previous)return previous;
 const job=(async()=>{
  const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('havana-private-photo-v1:'+token));
  const prefix=Array.from(new Uint8Array(raw)).map(n=>n.toString(16).padStart(2,'0')).join('');
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  return {prefix,key};
 })();
 keys.set(token,job);
 if(keys.size>4)keys.delete(keys.keys().next().value!);
 return job;
}
function hotKey(token:string,id:string){return token+'\u0000'+id;}
function remember(token:string,id:string,blob:Blob,expiresAt:number){
 const key=hotKey(token,id);
 hot.delete(key);hot.set(key,{blob,expiresAt,usedAt:Date.now()});
 while(hot.size>MAX_HOT)hot.delete(hot.keys().next().value!);
}
function request<T>(db:IDBDatabase,mode:IDBTransactionMode,make:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T|null>{
 return new Promise(resolve=>{
  try{
   const r=make(db.transaction(STORE,mode).objectStore(STORE));
   r.onsuccess=()=>resolve(r.result??null);
   r.onerror=()=>resolve(null);
  }catch{resolve(null);}
 });
}
export async function readPrivateImage(token:string|undefined,id:string):Promise<Blob|null>{
 if(!token||!id)return null;
 const name=hotKey(token,id),now=Date.now(),warm=hot.get(name);
 if(warm){
  if(warm.expiresAt>now){warm.usedAt=now;return warm.blob;}
  hot.delete(name);
 }
 if(!available())return null;
 try{
  const db=await open();if(!db)return null;
  const {prefix,key}=await material(token);
  const row=await request<Row>(db,'readonly',store=>store.get(prefix+':'+id));
  if(!row)return null;
  if(row.expiresAt<=Date.now()){
   void request(db,'readwrite',store=>store.delete(prefix+':'+id));return null;
  }
  const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:row.iv},key,row.payload);
  const blob=new Blob([bytes],{type:row.mime});
  remember(token,id,blob,row.expiresAt);
  return blob;
 }catch{return null;}
}
async function prune(db:IDBDatabase){
 try{
  const rows=await request<Row[]>(db,'readonly',s=>s.getAll());
  if(!rows)return;
  const sorted=rows.sort((a,b)=>a.updatedAt-b.updatedAt);
  let total=sorted.reduce((n,x)=>n+x.size,0),count=sorted.length;
  for(const row of sorted){
   if(row.expiresAt>Date.now()&&count<=MAX_ENTRIES&&total<=MAX_BYTES)break;
   await request(db,'readwrite',s=>s.delete(row.id));
   total-=row.size;count--;
  }
 }catch{/* An unavailable or low-storage Safari DB must not block the image. */}
}
export async function storePrivateImage(token:string|undefined,id:string,blob:Blob,expiresAt:number):Promise<void>{
 if(!token||!id||!blob.size||blob.size>MAX_ITEM_BYTES||!blob.type.startsWith('image/'))return;
 const until=Math.min(expiresAt,Date.now()+48*60*60*1000);
 if(until<=Date.now())return;
 remember(token,id,blob,until);
 if(!available())return;
 try{
  const db=await open();if(!db)return;
  const {prefix,key}=await material(token),iv=crypto.getRandomValues(new Uint8Array(12));
  const payload=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,await blob.arrayBuffer());
  await request(db,'readwrite',s=>s.put({
   id:prefix+':'+id,iv,payload,mime:blob.type,expiresAt:until,size:payload.byteLength,updatedAt:Date.now()
  } satisfies Row));
  if(++writes%12===0)void prune(db);
 }catch{/* Never delay image display for storage failure. */}
}
export async function deletePrivateImage(token:string|undefined,id:string):Promise<void>{
 if(!token||!id)return;
 hot.delete(hotKey(token,id));
 if(!available())return;
 try{
  const db=await open();if(!db)return;
  const {prefix}=await material(token);
  await request(db,'readwrite',s=>s.delete(prefix+':'+id));
 }catch{}
}
export async function clearPrivateImagesForToken(token:string|undefined):Promise<void>{
 if(!token)return;
 for(const k of hot.keys())if(k.startsWith(token+'\u0000'))hot.delete(k);
 if(!available())return;
 try{
  const db=await open();if(!db)return;
  const {prefix}=await material(token);
  const all=await request<IDBValidKey[]>(db,'readonly',s=>s.getAllKeys());
  for(const key of all||[])if(typeof key==='string'&&key.startsWith(prefix+':'))
   await request(db,'readwrite',s=>s.delete(key));
  keys.delete(token);
 }catch{}
}
