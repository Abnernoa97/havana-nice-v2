import {useCallback,useEffect,useRef,useState} from 'react';
import type {MemberStory} from '@havana/shared';
import {getWarmStoryPhoto,warmStoryPhoto,retainWarmStoryPhoto,invalidateWarmStoryPhoto,subscribeStoryPhotos} from './story-photo-pool';

// The current iPhone state opens like Android 0.0.30: directly from the
// authorized JPEG URL, or an already decoded private JPEG if available.
// Do not fetch/blob/decode the current image BEFORE rendering it.
export function useStoryPhotoCache(items:readonly MemberStory[],position:number){
 const pinned=useRef<{id:string;grant:string;url:string;displayed:boolean}|null>(null);
 const current=items[position];
 const [,rerender]=useState(0);
 if(current&&(!pinned.current||pinned.current.id!==current.id||
   pinned.current.grant!==current.photoUrl))
  pinned.current={id:current.id,grant:current.photoUrl,
   url:getWarmStoryPhoto(current)||current.photoUrl,displayed:false};
 useEffect(()=>{
  // Only the next frame is prepared behind the active one.
  const next=items[position+1];
  if(next)void warmStoryPhoto(next).catch(()=>{});
 },[items,position]);
 // If a still-loading network image has a prepared local copy, use it.
 // Once onLoad has fired never replace its pixels merely because cache warms.
 useEffect(()=>{
  if(!current)return;
  const adopt=()=>{
   const selected=pinned.current;
   if(!selected||selected.id!==current.id||selected.grant!==current.photoUrl||
    selected.displayed||selected.url.startsWith('blob:'))return;
   const prepared=getWarmStoryPhoto(current);
   if(prepared){selected.url=prepared;rerender(n=>n+1);}
  };
  const unsubscribe=subscribeStoryPhotos(adopt);adopt();
  return unsubscribe;
 },[current?.id,current?.photoUrl,current?.createdAt,current?.expiresAt]);
 const markDisplayed=useCallback((id:string,url:string)=>{
  if(pinned.current?.id===id&&pinned.current.url===url)pinned.current.displayed=true;
 },[]);
 const url=current?pinned.current?.url||current.photoUrl:'';
 useEffect(()=>retainWarmStoryPhoto(url),[url]);
 const fallbackToRemote=useCallback((id:string,failedUrl:string)=>{
  const chosen=pinned.current;
  if(!chosen||chosen.id!==id||chosen.url!==failedUrl||!failedUrl.startsWith('blob:'))return false;
  invalidateWarmStoryPhoto(id,failedUrl);
  chosen.url=chosen.grant;chosen.displayed=false;
  rerender(n=>n+1);
  return true;
 },[]);
 return {url,fallbackToRemote,markDisplayed};
}
