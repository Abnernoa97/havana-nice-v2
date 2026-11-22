import {useEffect,useRef,useState} from 'react';
import type {MemberStory} from '@havana/shared';

type CachedPhoto={grant:string;objectUrl:string};
type PendingPhoto={grant:string;abort:AbortController};

// Ephemeral photo cache scoped to the open story viewer. Downloads one private
// JPEG once, decodes it once, and displays the same local Blob URL. Preparing
// the next photo avoids a black frame between six-second states. Nothing is
// written to storage; URLs are revoked when the viewer closes.
export function useStoryPhotoCache(
 items:readonly MemberStory[],position:number,onPhotoError:(id:string)=>void
){
 const cache=useRef(new Map<string,CachedPhoto>());
 const pending=useRef(new Map<string,PendingPhoto>());
 const failures=useRef(new Set<string>());
 const onError=useRef(onPhotoError);
 onError.current=onPhotoError;
 const active=useRef(true);
 const [,refresh]=useState(0);

 useEffect(()=>{
  active.current=true;
  return()=>{
   active.current=false;
   for(const task of pending.current.values())task.abort.abort();
   pending.current.clear();
   for(const entry of cache.current.values())URL.revokeObjectURL(entry.objectUrl);
   cache.current.clear();
  };
 },[]);

 useEffect(()=>{
  const ids=new Set(items.map(item=>item.id));
  for(const [id,entry] of cache.current){
   if(!ids.has(id)){
    URL.revokeObjectURL(entry.objectUrl);
    cache.current.delete(id);
   }
  }
  for(const [id,task] of pending.current){
   if(!ids.has(id)){task.abort.abort();pending.current.delete(id);}
  }
  // Current and immediate next story only: small bounded network work.
  for(const item of items.slice(position,position+2)){
   if(!item)continue;
   const cached=cache.current.get(item.id);
   if(cached?.grant===item.photoUrl)continue;
   if(cached){URL.revokeObjectURL(cached.objectUrl);cache.current.delete(item.id);}
   const existing=pending.current.get(item.id);
   if(existing?.grant===item.photoUrl)continue;
   if(existing){existing.abort.abort();pending.current.delete(item.id);}
   if(failures.current.has(item.photoUrl))continue;
   const task:PendingPhoto={grant:item.photoUrl,abort:new AbortController()};
   pending.current.set(item.id,task);
   void (async()=>{
    let localUrl:string|undefined;
    try{
     const response=await fetch(item.photoUrl,{
      signal:task.abort.signal,credentials:'omit',cache:'no-store'
     });
     if(!response.ok)throw new Error('Estado no disponible');
     const blob=await response.blob();
     if(blob.type!=='image/jpeg'||!blob.size||blob.size>1_500_000)
      throw new Error('Fotografía inválida');
     localUrl=URL.createObjectURL(blob);
     const image=new Image();
     image.decoding='async';
     image.src=localUrl;
     if(image.decode)await image.decode();
     else await new Promise<void>((resolve,reject)=>{
      image.onload=()=>resolve();image.onerror=()=>reject(new Error('Fotografía dañada'));
     });
     if(!active.current||task.abort.signal.aborted)return;
     const former=cache.current.get(item.id);
     if(former)URL.revokeObjectURL(former.objectUrl);
     cache.current.set(item.id,{grant:item.photoUrl,objectUrl:localUrl});
     localUrl=undefined;
     refresh(n=>n+1);
    }catch{
     if(active.current&&!task.abort.signal.aborted){
      failures.current.add(item.photoUrl);
      onError.current(item.id); // renew expired R2 grant at most once
      refresh(n=>n+1);
     }
    }finally{
     if(localUrl)URL.revokeObjectURL(localUrl);
     if(pending.current.get(item.id)===task)pending.current.delete(item.id);
    }
   })();
  }
 },[items,position]);

 const current=items[position];
 const cached=current&&cache.current.get(current.id);
 return {
  url:cached?.grant===current?.photoUrl?cached.objectUrl:'',
  failed:!!current&&failures.current.has(current.photoUrl)
 };
}
