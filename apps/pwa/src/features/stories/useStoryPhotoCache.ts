import {useEffect,useRef} from 'react';
import type {MemberStory} from '@havana/shared';
import {getWarmStoryPhoto,warmStoryPhoto} from './story-photo-pool';

// The current iPhone state opens like Android 0.0.30: directly from the
// authorized JPEG URL, or an already decoded private JPEG if available.
// Do not fetch/blob/decode the current image BEFORE rendering it.
export function useStoryPhotoCache(items:readonly MemberStory[],position:number){
 const pinned=useRef<{id:string;grant:string;url:string}|null>(null);
 const current=items[position];
 if(current&&(!pinned.current||pinned.current.id!==current.id||
   pinned.current.grant!==current.photoUrl))
  pinned.current={id:current.id,grant:current.photoUrl,
   url:getWarmStoryPhoto(current)||current.photoUrl};
 useEffect(()=>{
  // Only the next frame is prepared behind the active one.
  const next=items[position+1];
  if(next)void warmStoryPhoto(next).catch(()=>{});
 },[items,position]);
 return {url:current?pinned.current?.url||current.photoUrl:''};
}
