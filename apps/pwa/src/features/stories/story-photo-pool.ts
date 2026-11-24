import type {MemberStory} from '@havana/shared';

// Ephemeral, per-session decoded JPEG pool. Never persist private R2 photos,
// short-lived signed grants or musician credentials in browser storage.
type Entry={grant:string;createdAt:number;expiresAt:number;url:string;pending:Promise<string>|null;lastUsed:number};
// A story ID identifies one immutable R2 photo: renewing its short-lived grant
// does not invalidate an already decoded image belonging to this same session.
const samePhoto=(entry:Entry,story:MemberStory)=>entry.createdAt===story.createdAt&&
 entry.expiresAt===story.expiresAt&&story.expiresAt>Date.now();
const entries=new Map<string,Entry>();
const subscribers=new Set<()=>void>();
const LIMIT=18;
let owner:string|undefined;
const notify=()=>{for(const listener of subscribers)listener();};
const release=(entry:Entry)=>{if(entry.url)URL.revokeObjectURL(entry.url);};
export function setStoryPhotoOwner(token:string|undefined){
 if(owner===token)return;
 owner=token;
 for(const entry of entries.values())release(entry);
 entries.clear();
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
function trimPool(){
 if(entries.size<=LIMIT)return;
 const sorted=[...entries.entries()].sort((a,b)=>a[1].lastUsed-b[1].lastUsed);
 for(const [id,entry] of sorted){
  if(entries.size<=LIMIT)break;
  if(entry.pending)continue;
  entries.delete(id);release(entry);
 }
}
export function warmStoryPhoto(story:MemberStory):Promise<string>{
 if(story.expiresAt<=Date.now())return Promise.resolve('');
 const existing=entries.get(story.id);
 if(existing&&samePhoto(existing,story)){
  existing.lastUsed=Date.now();
  if(existing.url)return Promise.resolve(existing.url);
  // A failed/expired grant must never trap a newer grant behind an old fetch.
  if(existing.pending&&existing.grant===story.photoUrl)return existing.pending;
 }
 if(existing){entries.delete(story.id);release(existing);}
 const entry:Entry={grant:story.photoUrl,createdAt:story.createdAt,
  expiresAt:story.expiresAt,url:'',pending:null,lastUsed:Date.now()};
 entries.set(story.id,entry);
 entry.pending=(async()=>{
  let localUrl='';
  try{
   const response=await fetch(story.photoUrl,{credentials:'omit',cache:'no-store'});
   if(!response.ok)throw Error('Estado no disponible');
   const blob=await response.blob();
   if(blob.type!=='image/jpeg'||!blob.size||blob.size>1_500_000)throw Error('Imagen inválida');
   localUrl=URL.createObjectURL(blob);
   const img=new Image();img.decoding='async';img.src=localUrl;
   if(img.decode)await img.decode();
   else await new Promise<void>((resolve,reject)=>{
    img.onload=()=>resolve();img.onerror=()=>reject(Error('Foto dañada'));
   });
   if(entries.get(story.id)!==entry||story.expiresAt<=Date.now())return '';
   entry.url=localUrl;localUrl='';entry.lastUsed=Date.now();
   notify();trimPool();
   return entry.url;
  }catch{return '';}
  finally{
   if(localUrl)URL.revokeObjectURL(localUrl);
   if(entries.get(story.id)===entry){
    entry.pending=null;
    if(!entry.url){entries.delete(story.id);notify();}
   }
  }
 })();
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
 for(const story of [...newest.values()].slice(0,10))void warmStoryPhoto(story);
}
