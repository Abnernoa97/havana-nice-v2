// Presentation only: the private grant, inline preview, and fullscreen
// original each live in an independent module with one responsibility.
import {useEffect,useState} from 'react';
import {useChatMediaPreview} from './useChatMediaPreview';
import ChatPhotoViewer from './ChatPhotoViewer';
import ChatVideoPlayer from './ChatVideoPlayer';
import type {ChatMedia} from './chat-media-types';
export type {ChatMedia} from './chat-media-types';

export default function ChatMediaView({media,token,compact=false}:{media:ChatMedia;token:string;compact?:boolean}){
 const [videoRequest,setVideoRequest]=useState(0);
 const {surface,preview,poster,videoGrant,error,visible}=useChatMediaPreview(media,token,videoRequest);
 const [photoOpen,setPhotoOpen]=useState(false);
 const [videoOpen,setVideoOpen]=useState(false);
 useEffect(()=>{setVideoRequest(0);setPhotoOpen(false);setVideoOpen(false);},[media.assetId,token]);
 // A video outside the viewport must not keep a decoder active.
 useEffect(()=>{if(!visible&&!videoOpen)setVideoRequest(0);},[visible,videoOpen]);
 return <>
   <div ref={surface} className={'hn-chat-media'+(compact?' is-tile':'')}>
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
       :<button type="button" className="hn-chat-video-cover"
           onClick={()=>{setVideoOpen(true);setVideoRequest(1);}} aria-label="Abrir reproductor de video">
           {poster&&<img src={poster} alt="" className="hn-chat-video-poster" decoding="async"/>}
           <span aria-hidden="true">▶</span>{!compact&&<span className="hn-chat-video-caption">Ver video</span>}
         </button>}
   </div>
   {media.kind==='photo'&&photoOpen&&<ChatPhotoViewer media={media} token={token} preview={preview}
     onClose={()=>setPhotoOpen(false)}/>}
   {media.kind==='video'&&videoOpen&&<ChatVideoPlayer url={videoGrant} poster={poster}
     error={error} onRetry={()=>setVideoRequest(n=>n+1)} onClose={()=>setVideoOpen(false)}/>}
 </>;
}
