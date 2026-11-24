import {useCallback,useEffect,useRef,useState} from 'react';
import type {MemberStory} from '@havana/shared';
import {getWarmStoryPhoto,warmStoryPhoto,retainWarmStoryPhoto,invalidateWarmStoryPhoto} from './story-photo-pool';

// The current iPhone state opens like Android 0.0.30: directly from the
// authorized JPEG URL, or an already decoded private JPEG if available.
// Do not fetch/blob/decode the current image BEFORE rendering it.
export function useStoryPhotoCache(items:readonly MemberStory[],position:number){
 const pinned=useRef<{id:string;grant:string;url:string}|null>(null);
 const current=items[position];
 const [,rerender]=useState(0);
 if(current&&(!pinned.current||pinned.current.id!==current.id||
   pinned.current.grant!==current.photoUrl))
  pinned.current={id:current.id,grant:current.photoUrl,
   url:getWarmStoryPhoto(current)||current.photoUrl};
 useEffect(()=>{
  // Only the next frame is prepared behind the active one.
  const next=items[position+1];
  if(next)void warmStoryPhoto(next).catch(()=>{});
 },[items,position]);
 const url=current?pinned.current?.url||current.photoUrl:'';
 useEffect(()=>retainWarmStoryPhoto(url),[url]);
 const fallbackToRemote=useCallback((id:string,failedUrl:string)=>{
  const chosen=pinned.current;
  if(!chosen||chosen.id!==id||chosen.url!==failedUrl||!failedUrl.startsWith('blob:'))return false;
  invalidateWarmStoryPhoto(id,failedUrl);
  chosen.url=chosen.grant;
  rerender(n=>n+1);
  return true;
 },[]);
 return {url,fallbackToRemote};
}
