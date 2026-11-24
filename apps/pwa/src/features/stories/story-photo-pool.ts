import type {MemberStory} from '@havana/shared';
import {readPrivateImage,storePrivateImage} from '../../services/private-image-cache';

// Ephemeral, session-owned decoded JPEG pool. Only expiring AES-GCM encrypted
// bitmaps are persisted for iPhone reopen; no signed grants/credentials are stored.
type Entry={grant:string;createdAt:number;expiresAt:number;url:string;pending:Promise<string>|null;lastUsed:number;controller:AbortController;localOnly:boolean};
// A story ID identifies one immutable R2 photo: renewing its short-lived grant
// does not invalidate an already decoded image belonging to this same session.
const samePhoto=(entry:Entry,story:MemberStory)=>entry.createdAt===story.createdAt&&
 entry.expiresAt===story.expiresAt&&story.expiresAt>Date.now();
const entries=new Map<string,Entry>();
const subscribers=new Set<()=>void>();
const retained=new Map<string,number>();
const LIMIT=18;
const CACHE_LOOKUP_BUDGET_MS=120;
const WARM_TIMEOUT_MS=8000;
// Visible images never wait for this optional single background lane.
let warming=false;
const waiting:Array<()=>void>=[];
async function withWarmSlot<T>(task:()=>Promise<T>,priority:boolean):Promise<T>{
 if(warming)await new Promise<void>(resolve=>{if(priority)waiting.unshift(resolve);else waiting.push(resolve);});
 else warming=true;
 try{return await task();}
 finally{const next=waiting.shift();if(next)next();else warming=false;}
}
// Safari may hold an IndexedDB open while the PWA starts. A private-cache
// lookup is optional; never let it block the first R2 image indefinitely.
async function readCachedStoryQuickly(token:string,id:string):Promise<Blob|null>{
 let timer:ReturnType<typeof setTimeout>|null=null;
 try{return await Promise.race([
  readPrivateImage(token,id),
  new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),CACHE_LOOKUP_BUDGET_MS);})
 ]);}finally{if(timer!==null)clearTimeout(timer);}
}
let owner:string|undefined;
const notify=()=>{for(const listener of subscribers)listener();};
const release=(entry:Entry)=>{entry.controller.abort();if(entry.url)URL.revokeObjectURL(entry.url);};
export function setStoryPhotoOwner(token:string|undefined){
 if(owner===token)return;
 owner=token;
 for(const entry of entries.values())release(entry);
 entries.clear();retained.clear();
 notify();
}
export const subscribeStoryPhotos=(listener:()=>void)=>{
 subscribers.add(listener);
 return()=>{subscribers.delete(listener);};
};
export function getWarmStoryPhoto(story:MemberStory|undefined|null):string{
 if(!story)return '';
 const entry=entries.get(story.id);
 if(!entry||!samePhoto(entry,story))return '';
 entry.lastUsed=Date.now();
 return entry.url;
}
// A live cover/viewer must not lose its Blob while another story warms.
export function retainWarmStoryPhoto(url:string):()=>void{
 if(!url.startsWith('blob:'))return()=>{};
 retained.set(url,(retained.get(url)||0)+1);
 return()=>{
  const count=retained.get(url)||0;
  if(count<=1)retained.delete(url);else retained.set(url,count-1);
  trimPool();
 };
}
export function invalidateWarmStoryPhoto(id:string,url:string){
 const entry=entries.get(id);
 if(!entry||entry.url!==url||!url.startsWith('blob:'))return;
 entries.delete(id);release(entry);notify();
}
function trimPool(){
 if(entries.size<=LIMIT)return;
 const sorted=[...entries.entries()].sort((a,b)=>a[1].lastUsed-b[1].lastUsed);
 for(const [id,entry] of sorted){
  if(entries.size<=LIMIT)break;
  if(entry.pending||retained.has(entry.url))continue;
  entries.delete(id);release(entry);
 }
}
export function warmStoryPhoto(story:MemberStory,localOnly=false):Promise<string>{
 if(story.expiresAt<=Date.now())return Promise.resolve('');
 const existing=entries.get(story.id);
 if(existing&&samePhoto(existing,story)){
  existing.lastUsed=Date.now();
  if(existing.url)return Promise.resolve(existing.url);
  // A failed/expired grant must never trap a newer grant behind an old fetch.
  if(existing.pending&&existing.grant===story.photoUrl){
   const requestOwner=owner;
   if(!localOnly&&existing.localOnly)return existing.pending.then(url=>
    url||(owner===requestOwner?warmStoryPhoto(story):''));
   return existing.pending;
  }
 }
 if(waiting.length>=LIMIT)return Promise.resolve('');
 if(existing){entries.delete(story.id);release(existing);}
 const entry:Entry={grant:story.photoUrl,createdAt:story.createdAt,
  expiresAt:story.expiresAt,url:'',pending:null,lastUsed:Date.now(),controller:new AbortController(),localOnly};
 entries.set(story.id,entry);
 const requestOwner=owner;
 entry.pending=withWarmSlot(async()=>{
  let localUrl='';
  let timer:ReturnType<typeof setTimeout>|null=null;
  let image:HTMLImageElement|undefined;
  const signal=entry.controller.signal;
  try{
   if(signal.aborted||requestOwner!==owner||entries.get(story.id)!==entry||story.expiresAt<=Date.now())return '';
   const cancelled=new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Precarga cancelada')),{once:true}));
   // Attach a rejection handler even when no asynchronous operation is needed.
   void cancelled.catch(()=>{});
   timer=setTimeout(()=>entry.controller.abort(),WARM_TIMEOUT_MS);
   // The same immutable story was previously decoded by this musician.
   // Check the expiring encrypted local copy BEFORE requesting a new R2 grant.
   const cacheId='story:'+story.id+':'+story.createdAt+':'+story.expiresAt;
   let blob=requestOwner?await Promise.race([readCachedStoryQuickly(requestOwner,cacheId),cancelled]):null;
   if(signal.aborted||requestOwner!==owner||entries.get(story.id)!==entry)return '';
   const cached=!!blob;
   if(!blob){
    if(localOnly)return '';
    const response=await Promise.race([fetch(story.photoUrl,{credentials:'omit',cache:'no-store',signal}),cancelled]);
    if(!response.ok)throw Error('Estado no disponible');
    blob=await Promise.race([response.blob(),cancelled]);
   }
   if(signal.aborted||entries.get(story.id)!==entry)return '';
   if(blob.type!=='image/jpeg'||!blob.size||blob.size>1_500_000)throw Error('Imagen inválida');
   localUrl=URL.createObjectURL(blob);
   const img=new Image();image=img;img.decoding='async';
   const decoded=img.decode?(()=>{img.src=localUrl;return img.decode();})():new Promise<void>((resolve,reject)=>{
    img.onload=()=>resolve();img.onerror=()=>reject(Error('Foto dañada'));img.src=localUrl;
   });
   await Promise.race([decoded,cancelled]);
   if(signal.aborted||entries.get(story.id)!==entry||story.expiresAt<=Date.now())return '';
   entry.url=localUrl;localUrl='';entry.lastUsed=Date.now();
   if(!cached&&requestOwner&&owner===requestOwner)
    void storePrivateImage(requestOwner,cacheId,blob,story.expiresAt);
   notify();trimPool();
   return entry.url;
  }catch{return '';}
  finally{
   if(timer!==null)clearTimeout(timer);
   if(image){image.onload=null;image.onerror=null;image.removeAttribute?.('src');}
   if(localUrl)URL.revokeObjectURL(localUrl);
   if(entries.get(story.id)===entry){
    entry.pending=null;
    if(!entry.url){entries.delete(story.id);notify();}
   }
  }
 },!localOnly);
 trimPool();
 return entry.pending;
}
export function warmStoryCovers(stories:readonly MemberStory[]){
 const newest=new Map<string,MemberStory>();
 for(const story of stories){
  if(story.expiresAt<=Date.now())continue;
  const previous=newest.get(story.actorId);
  if(!previous||story.createdAt>previous.createdAt||
   (story.createdAt===previous.createdAt&&story.id>previous.id))
   newest.set(story.actorId,story);
 }
 // Warm the visible circles, not every photo ever posted by the team.
 // Visible covers already have a direct <img>. Restore local bytes only.
 for(const story of [...newest.values()].slice(0,10))void warmStoryPhoto(story,true);
}
