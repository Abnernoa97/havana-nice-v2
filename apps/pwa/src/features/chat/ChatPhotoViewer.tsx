// One purpose: open the confirmed R2 photo on tap. Show the cached thumbnail
// immediately, then replace it with the full uploaded image when available.
import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import type {ChatMedia} from './chat-media-types';
import {requestChatMediaUrl} from './chat-media-grant';

export default function ChatPhotoViewer({
 media,token,preview,onClose,
}:{media:ChatMedia;token:string;preview:string;onClose:()=>void}){
 const [original,setOriginal]=useState('');
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);

 useEffect(()=>{
   let active=true;
   let objectUrl='';
   const controller=new AbortController();
   setOriginal('');setError('');setLoading(true);
   void (async()=>{
     const signed=await requestChatMediaUrl(media.assetId,token,controller.signal);
     const response=await fetch(signed,{cache:'no-store',signal:controller.signal});
     if(!response.ok)throw Error('Original no disponible.');
     const blob=await response.blob();
     if(!active||controller.signal.aborted)return;
     objectUrl=URL.createObjectURL(blob);
     setOriginal(objectUrl);
   })().catch(()=>{
     if(active&&!controller.signal.aborted)
       setError('No se pudo abrir el original. Cierra e inténtalo de nuevo.');
   }).finally(()=>{if(active&&!controller.signal.aborted)setLoading(false);});
   return()=>{
     active=false;controller.abort();
     if(objectUrl)URL.revokeObjectURL(objectUrl);
   };
 },[media.assetId,token]);

 useEffect(()=>{
   const key=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
   document.addEventListener('keydown',key);
   return()=>document.removeEventListener('keydown',key);
 },[onClose]);
 return createPortal(
   <div className="hn-photo-overlay" role="dialog" aria-modal="true"
     aria-label="Fotografía ampliada" onClick={onClose}>
     <button type="button" className="hn-photo-close" aria-label="Cerrar fotografía"
       onClick={onClose}>×</button>
     {(original||preview)&&<img src={original||preview} alt="Fotografía ampliada"
       className="hn-photo-full" onClick={event=>event.stopPropagation()}/>}
     {!original&&!preview&&(loading||error)&&<div role={error?'alert':'status'}
       className="hn-photo-loading" onClick={event=>event.stopPropagation()}>
       {error||'Cargando fotografía…'}
     </div>}
   </div>,document.body
 );
}
