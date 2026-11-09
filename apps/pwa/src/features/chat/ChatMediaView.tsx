// Presentation only: the private grant, inline preview, and fullscreen
// original each live in an independent module with one responsibility.
import {useState} from 'react';
import {useChatMediaPreview} from './useChatMediaPreview';
import ChatPhotoViewer from './ChatPhotoViewer';
import type {ChatMedia} from './chat-media-types';
export type {ChatMedia} from './chat-media-types';

export default function ChatMediaView({media,token}:{media:ChatMedia;token:string}){
 const {surface,preview,videoGrant,error}=useChatMediaPreview(media,token);
 const [photoOpen,setPhotoOpen]=useState(false);
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
       :<div className="hn-media-loading" role="status">Cargando fotografía…</div>
       :videoGrant?<video key={videoGrant} src={videoGrant} playsInline controls
          preload="metadata" className="hn-chat-video"
          aria-label="Reproducir video enviado"/>
        :<div className="hn-media-loading" role="status">{error||'Cargando video…'}</div>}
   </div>
   {media.kind==='photo'&&<ChatPhotoViewer media={media} token={token}
     open={photoOpen} onClose={()=>setPhotoOpen(false)}/>}
 </>;
}
