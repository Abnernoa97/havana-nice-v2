import {useEffect,useRef,useState} from 'react';
import type {MemberStory} from '@havana/shared';
import {getWarmStoryPhoto,warmStoryPhoto} from './story-photo-pool';

// Share HOME's decoded private JPEG. Current + next photo preload, one stable
// canvas, no duplicate private download when opening a warmed story.
export function useStoryPhotoCache(
 items:readonly MemberStory[],position:number,onPhotoError:(id:string)=>void
){
 const [,refresh]=useState(0);
 const failures=useRef(new Set<string>());
 const onError=useRef(onPhotoError);onError.current=onPhotoError;
 useEffect(()=>{
  let active=true;
  for(const item of items.slice(position,position+2)){
   void warmStoryPhoto(item).then(url=>{
    if(!active)return;
    if(!url&&!failures.current.has(item.photoUrl)){
     failures.current.add(item.photoUrl);onError.current(item.id);
    }
    refresh(n=>n+1);
   });
  }
  return()=>{active=false;};
 },[items,position]);
 const current=items[position];
 return {url:getWarmStoryPhoto(current),
  failed:!!current&&failures.current.has(current.photoUrl)};
}
