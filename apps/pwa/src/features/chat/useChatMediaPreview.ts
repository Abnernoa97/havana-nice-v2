// One purpose: lazily load the media visible in the chat timeline. Every
// generated object URL is revoked and in-flight work aborted on unmount.
import {useEffect,useRef,useState} from 'react';
import type {ChatMedia} from './chat-media-types';
import {requestChatMediaUrl} from './chat-media-grant';
import {fetchChatPhotoThumbnail} from './chat-photo-preview';

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
     const signed=await requestChatMediaUrl(media.assetId,token,controller.signal);
     if(!alive)return;
     if(media.kind==='video'){setVideoGrant(signed);return;}
     const thumbnail=await fetchChatPhotoThumbnail(signed,controller.signal);
     if(!alive||controller.signal.aborted)return;
     previewUrl=URL.createObjectURL(thumbnail);
     setPreview(previewUrl);
   })().catch(()=>{
     if(alive&&!controller.signal.aborted)
       setError('No se pudo cargar la miniatura');
   });
   return()=>{
     alive=false;controller.abort();
     if(previewUrl)URL.revokeObjectURL(previewUrl);
   };
 },[visible,media.assetId,media.kind,token]);

 return {surface,preview,videoGrant,error};
}
