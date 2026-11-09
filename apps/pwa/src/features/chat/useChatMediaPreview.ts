// One purpose: lazily load the media visible in the chat timeline. Every
// generated object URL is revoked and in-flight work aborted on unmount.
import {useEffect,useRef,useState} from 'react';
import type {ChatMedia} from './chat-media-types';
import {requestChatMediaUrl} from './chat-media-grant';
import {fetchChatPhotoThumbnail} from './chat-photo-preview';
import {peekChatPhotoPreview,loadChatPhotoPreview,storeChatPhotoPreview} from './chat-photo-thumbnail-cache';

export function useChatMediaPreview(media:ChatMedia,token:string){
 const surface=useRef<HTMLDivElement|null>(null);
 const [visible,setVisible]=useState(false);
 const [preview,setPreview]=useState('');
 const [videoGrant,setVideoGrant]=useState('');
 const [error,setError]=useState('');

 useEffect(()=>{
   setVisible(false);
   const element=surface.current;
   if(!element)return;
   if(!('IntersectionObserver' in window)){setVisible(true);return;}
   let releaseTimer:ReturnType<typeof setTimeout>|null=null;
   // A small prefetch margin keeps images sharp before they reach the screen.
   // Delay unloading briefly so a small finger movement does not refetch.
   const observer=new IntersectionObserver(entries=>{
     if(entries.some(entry=>entry.isIntersecting)){
       if(releaseTimer!==null)clearTimeout(releaseTimer);
       releaseTimer=null;
       setVisible(true);
     }else if(releaseTimer===null){
       releaseTimer=setTimeout(()=>{
         releaseTimer=null;setVisible(false);
       },1500);
     }
   },{rootMargin:'320px'});
   observer.observe(element);
   return()=>{
     observer.disconnect();
     if(releaseTimer!==null)clearTimeout(releaseTimer);
   };
 },[media.assetId]);

 useEffect(()=>{
   if(!visible){
     // Release preview images and players once the row is well off-screen.
     setPreview('');setVideoGrant('');setError('');
     return;
   }
   let alive=true;
   let previewUrl='';
   const controller=new AbortController();
   setPreview('');setVideoGrant('');setError('');
   void (async()=>{
     if(media.kind==='photo'){
       // Reopening Chat must not download and resize the original again.
       // The in-memory hit is synchronous; IndexedDB survives page/app restarts.
       const immediate=peekChatPhotoPreview(token,media);
       const cached=immediate??await loadChatPhotoPreview(token,media);
       if(!alive||controller.signal.aborted)return;
       if(cached){
         previewUrl=URL.createObjectURL(cached);
         setPreview(previewUrl);
         return;
       }
     }
     // Only a first-time cache miss requests a private R2 grant.
     const signed=await requestChatMediaUrl(media.assetId,token,controller.signal);
     if(!alive)return;
     if(media.kind==='video'){setVideoGrant(signed);return;}
     const thumbnail=await fetchChatPhotoThumbnail(signed,controller.signal);
     if(!alive||controller.signal.aborted)return;
     previewUrl=URL.createObjectURL(thumbnail);
     setPreview(previewUrl);
     // Never persist the original photograph or any signed URL.
     void storeChatPhotoPreview(token,media,thumbnail);
   })().catch(()=>{
     if(alive&&!controller.signal.aborted)
       setError('No se pudo cargar la miniatura');
   });
   return()=>{
     alive=false;controller.abort();
     if(previewUrl)URL.revokeObjectURL(previewUrl);
   };
 },[visible,media.assetId,media.sizeBytes,media.kind,token]);

 return {surface,preview,videoGrant,error};
}
