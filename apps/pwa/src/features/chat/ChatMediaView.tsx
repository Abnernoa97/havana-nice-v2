// Presentation only: the private grant, inline preview, and fullscreen
// original each live in an independent module with one responsibility.
import {useEffect,useState} from 'react';
import {useChatMediaPreview} from './useChatMediaPreview';
import ChatPhotoViewer from './ChatPhotoViewer';
import type {ChatMedia} from './chat-media-types';
export type {ChatMedia} from './chat-media-types';

export default function ChatMediaView({media,token}:{media:ChatMedia;token:string}){
 const [videoRequest,setVideoRequest]=useState(0);
 const {surface,preview,poster,videoGrant,error,visible}=useChatMediaPreview(media,token,videoRequest);
 const [photoOpen,setPhotoOpen]=useState(false);
 useEffect(()=>{setVideoRequest(0);setPhotoOpen(false);},[media.assetId,token]);
 // A video outside the viewport must not keep a decoder active.
 useEffect(()=>{if(!visible)setVideoRequest(0);},[visible]);
 return <>
   <div ref={surface} className="hn-chat-media">
     {media.kind==='photo'?
       preview?<button type="button" className="hn-chat-image-button"
         onClick={()=>setPhotoOpen(true)} aria-label="Abrir fotografía original">
         <img src={preview} alt="Fotografía enviada" decoding="async"
           className="hn-chat-photo"/>
       </button>
       :error?<button type="button" className="hn-chat-image-button"
         onClick={()=>setPhotoOpen(true)} aria-label="Abrir fotografía original">
         {error} · Abrir original
       </button>
       :<div className="hn-media-loading hn-photo-placeholder" role="status">Cargando fotografía…</div>
       :videoRequest===0?
         <button type="button" className="hn-chat-video-cover"
           onClick={()=>setVideoRequest(1)} aria-label="Cargar video">
           {poster&&<img src={poster} alt="" className="hn-chat-video-poster" decoding="async"/>}
           <span aria-hidden="true">▶</span><span className="hn-chat-video-caption">Ver video</span>
         </button>
       :videoGrant?<video key={videoGrant} src={videoGrant} playsInline controls
          preload="none" className="hn-chat-video"
          aria-label="Reproducir video enviado"/>
       :error?<button type="button" className="hn-chat-video-cover"
           onClick={()=>setVideoRequest(n=>n+1)} aria-label="Reintentar carga del video">
           {error} · Reintentar
         </button>
       :<div className="hn-media-loading hn-video-placeholder" role="status">Preparando video…</div>}
   </div>
   {media.kind==='photo'&&photoOpen&&<ChatPhotoViewer media={media} token={token} preview={preview}
     onClose={()=>setPhotoOpen(false)}/>}
 </>;
}
