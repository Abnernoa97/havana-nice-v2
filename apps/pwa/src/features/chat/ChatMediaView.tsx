import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
import {fetchChatPhotoThumbnail} from './chat-photo-preview';

export type ChatMedia={assetId:string;kind:'photo'|'video';mimeType:string;sizeBytes:number;name:string};
const signedPath=(id:string)=>API+'/api/chat/media/'+id+'/grant';

async function grantChatMedia(id:string,token:string,signal:AbortSignal):Promise<string>{
 const response=await fetch(signedPath(id),{
   headers:{Authorization:'Bearer '+token},cache:'no-store',signal,
 });
 if(!response.ok)throw Error('Archivo no disponible.');
 const data=await response.json() as {url?:string};
 if(!data.url?.startsWith(API+'/api/chat/media/'))throw Error('Archivo no disponible.');
 return data.url;
}

// Shared with the Admin: thumbnails consume bounded memory.
// A full original is downloaded only after the person explicitly opens it.
export default function ChatMediaView({media,token}:{media:ChatMedia;token:string}){
 const surface=useRef<HTMLDivElement|null>(null);
 const [preview,setPreview]=useState('');
 const [videoGrant,setVideoGrant]=useState('');
 const [visible,setVisible]=useState(false);
 const [error,setError]=useState('');
 const [enlarged,setEnlarged]=useState(false);
 const [fullPhoto,setFullPhoto]=useState('');
 const [loadingFull,setLoadingFull]=useState(false);
 const [fullError,setFullError]=useState('');
 const fullController=useRef<AbortController|null>(null);
 const fullUrl=useRef('');

 useEffect(()=>{
   const element=surface.current;
   if(!element)return;
   if(!('IntersectionObserver' in window)){setVisible(true);return;}
   const observer=new IntersectionObserver(entries=>{
     if(entries.some(entry=>entry.isIntersecting))setVisible(true);
   },{rootMargin:'160px'});
   observer.observe(element);
   return()=>observer.disconnect();
 },[media.assetId]);

 useEffect(()=>{
   if(!visible)return;
   let alive=true;
   const controller=new AbortController();
   let previewUrl='';
   setPreview('');setVideoGrant('');setError('');
   void (async()=>{
     const signed=await grantChatMedia(media.assetId,token,controller.signal);
     if(!alive)return;
     if(media.kind==='video'){setVideoGrant(signed);return;}
     const thumbnail=await fetchChatPhotoThumbnail(signed,controller.signal);
     if(!alive||controller.signal.aborted)return;
     previewUrl=URL.createObjectURL(thumbnail);
     setPreview(previewUrl);
   })().catch(()=>{
     if(alive&&!controller.signal.aborted)setError('No se pudo cargar la miniatura');
   });
   return()=>{alive=false;controller.abort();if(previewUrl)URL.revokeObjectURL(previewUrl);};
 },[visible,media.assetId,media.kind,token]);

 const close=useCallback(()=>{
   fullController.current?.abort();fullController.current=null;
   if(fullUrl.current){URL.revokeObjectURL(fullUrl.current);fullUrl.current='';}
   setFullPhoto('');setLoadingFull(false);setFullError('');setEnlarged(false);
 },[]);
 useEffect(()=>()=>{fullController.current?.abort();if(fullUrl.current)URL.revokeObjectURL(fullUrl.current);},[]);
 const openFull=()=>{
   setEnlarged(true);setFullError('');setLoadingFull(true);
   fullController.current?.abort();
   const controller=new AbortController();fullController.current=controller;
   void (async()=>{
     // Reauthorize on tap: the thumbnail grant may already have expired.
     const signed=await grantChatMedia(media.assetId,token,controller.signal);
     const response=await fetch(signed,{cache:'no-store',signal:controller.signal});
     if(!response.ok)throw Error('Original no disponible.');
     const blob=await response.blob();
     if(controller.signal.aborted)return;
     const url=URL.createObjectURL(blob);
     if(controller.signal.aborted){URL.revokeObjectURL(url);return;}
     if(fullUrl.current)URL.revokeObjectURL(fullUrl.current);
     fullUrl.current=url;setFullPhoto(url);
   })().catch(()=>{
     if(!controller.signal.aborted)setFullError('No se pudo abrir el original. Intenta de nuevo.');
   }).finally(()=>{
     if(!controller.signal.aborted)setLoadingFull(false);
   });
 };
 useEffect(()=>{
   if(!enlarged)return;
   const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
   document.addEventListener('keydown',key);
   return()=>document.removeEventListener('keydown',key);
 },[enlarged,close]);

 return <>
   <div ref={surface} className="hn-chat-media">
     {media.kind==='photo'?
       preview?<button type="button" className="hn-chat-image-button" onClick={openFull}
          aria-label="Ampliar fotografía">
         <img src={preview} alt="Fotografía enviada" decoding="async" className="hn-chat-photo"/>
       </button>
       :error?<button type="button" className="hn-chat-image-button" onClick={openFull}
          aria-label="Abrir fotografía original">{error} · Abrir original</button>
       :<div className="hn-media-loading" role="status">Cargando miniatura…</div>
       :videoGrant?<video key={videoGrant} src={videoGrant} playsInline controls preload="metadata"
          className="hn-chat-video" aria-label="Reproducir video enviado"/>
        :<div className="hn-media-loading" role="status">{error||'Cargando…'}</div>}
   </div>
   {enlarged&&createPortal(
     <div className="hn-photo-overlay" role="dialog" aria-modal="true"
       aria-label="Fotografía ampliada" onClick={close}>
       <button type="button" className="hn-photo-close" aria-label="Cerrar fotografía" onClick={close}>×</button>
       {(fullPhoto||preview)&&<img src={fullPhoto||preview}
         alt="Fotografía ampliada" className="hn-photo-full"
         onClick={event=>event.stopPropagation()}/>}
       {loadingFull&&<div className="hn-media-loading" role="status">Abriendo original…</div>}
       {fullError&&<div className="hn-media-loading" role="alert">{fullError}</div>}
     </div>,document.body)}
 </>;
}
