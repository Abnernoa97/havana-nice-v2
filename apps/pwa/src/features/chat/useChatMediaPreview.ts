// PWA Chat media lifetime: photos load once per mounted message and keep
// their decoded preview while scrolling; video is only active near viewport.
// Blob URLs are released on unmount or authorized identity/media change.
import {useEffect,useRef,useState} from 'react';
import type {ChatMedia} from './chat-media-types';
import {requestChatMediaUrl,chatVideoPosterUrl} from './chat-media-grant';
import {fetchChatPhotoThumbnail} from './chat-photo-preview';
import {peekChatPhotoPreview,loadChatPhotoPreview,storeChatPhotoPreview} from './chat-photo-thumbnail-cache';

export function useChatMediaPreview(media:ChatMedia,token:string,videoRequest=0){
 const surface=useRef<HTMLDivElement|null>(null);
 const [visible,setVisible]=useState(false);
 const [photoRequested,setPhotoRequested]=useState(false);
 const [poster,setPoster]=useState('');
 const [preview,setPreview]=useState('');
 const [videoGrant,setVideoGrant]=useState('');
 const [error,setError]=useState('');

 // Photo observation ends at the first near-viewport entry. Do not toggle
 // image src/DOM off and back on for every finger movement on iOS WebKit.
 useEffect(()=>{
   if(media.kind!=='photo'&&media.kind!=='video')return;
   const element=surface.current;
   if(!element)return;
   if(!('IntersectionObserver' in window)){setPhotoRequested(true);return;}
   const observer=new IntersectionObserver(entries=>{
     if(entries.some(entry=>entry.isIntersecting)){
       observer.disconnect();
       setPhotoRequested(true);
     }
   },{rootMargin:'900px'});
   observer.observe(element);
   return()=>observer.disconnect();
 },[media.assetId,media.kind,token]);

 // Video keeps its previous visibility policy: decoders stay offscreen only
 // briefly; photos do not subscribe to these visibility changes.
 useEffect(()=>{
   if(media.kind!=='video')return;
   setVisible(false);
   const element=surface.current;
   if(!element)return;
   if(!('IntersectionObserver' in window)){setVisible(true);return;}
   let releaseTimer:ReturnType<typeof setTimeout>|null=null;
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
 },[media.assetId,media.kind]);

 // Keep a photo preview throughout its mounted timeline row. The cached blob
 // may come from RAM or IndexedDB; only a genuine cache miss reaches R2.
 useEffect(()=>{
   if(media.kind!=='photo'||!photoRequested)return;
   let alive=true;
   let previewUrl='';
   const controller=new AbortController();
   setPreview('');
   setError('');
   void (async()=>{
     const immediate=peekChatPhotoPreview(token,media);
     const cached=immediate??await loadChatPhotoPreview(token,media);
     if(!alive||controller.signal.aborted)return;
     let thumbnail=cached;
     if(!thumbnail){
       const signed=await requestChatMediaUrl(media.assetId,token,controller.signal);
       if(!alive||controller.signal.aborted)return;
       thumbnail=await fetchChatPhotoThumbnail(signed,controller.signal);
       if(!alive||controller.signal.aborted)return;
       void storeChatPhotoPreview(token,media,thumbnail);
     }
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
 },[photoRequested,media.assetId,media.sizeBytes,media.kind,token]);

 // A confirmed video poster is a tiny JPEG, using the existing photo-preview
 // cache and private grant. No video decoder is mounted while scrolling.
 useEffect(()=>{
   if(media.kind!=='video'||!photoRequested)return;
   let alive=true;
   let coverUrl='';
   const abort=new AbortController();
   setPoster('');
   void (async()=>{
     const immediate=peekChatPhotoPreview(token,media);
     let jpeg=immediate??await loadChatPhotoPreview(token,media);
     if(!alive||abort.signal.aborted)return;
     if(!jpeg){
       const grant=await requestChatMediaUrl(media.assetId,token,abort.signal);
       const response=await fetch(chatVideoPosterUrl(grant),{
         signal:abort.signal,cache:'no-store'});
       if(!response.ok)return; // Old video or missing JPEG: keep the play tile.
       jpeg=await response.blob();
       if(!alive||abort.signal.aborted||jpeg.type!=='image/jpeg'||
         jpeg.size===0||jpeg.size>256*1024)return;
       void storeChatPhotoPreview(token,media,jpeg);
     }
     coverUrl=URL.createObjectURL(jpeg);
     setPoster(coverUrl);
   })().catch(()=>{/* Poster is optional: playback keeps working. */});
   return()=>{
     alive=false;abort.abort();
     if(coverUrl)URL.revokeObjectURL(coverUrl);
   };
 },[photoRequested,media.assetId,media.sizeBytes,media.kind,token]);

 // Video authorization is independent from photo preview lifetime.
 useEffect(()=>{
   if(media.kind!=='video'||!visible||videoRequest===0){
     setVideoGrant('');
     return;
   }
   let alive=true;
   const controller=new AbortController();
   setVideoGrant('');setError('');
   void requestChatMediaUrl(media.assetId,token,controller.signal).then(signed=>{
     if(alive&&!controller.signal.aborted)setVideoGrant(signed);
   }).catch(()=>{
     if(alive&&!controller.signal.aborted)setError('No se pudo cargar el video');
   });
   return()=>{alive=false;controller.abort();};
 },[visible,media.assetId,media.kind,token,videoRequest]);

 return {surface,preview,poster,videoGrant,error,visible};
}
