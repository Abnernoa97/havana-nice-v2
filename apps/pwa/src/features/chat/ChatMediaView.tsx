// Inline Chat media presentation, independent of the one shared fullscreen viewer.
// The parent timeline owns gallery selection across all loaded messages.
import {useEffect,useRef,useState} from 'react';
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
import {requestChatMediaUrl,chatVideoPosterUrl} from './chat-media-grant';
import {useChatMediaPreview} from './useChatMediaPreview';
import ChatVoiceMessage from './ChatVoiceMessage';
import type {ChatMedia} from './chat-media-types';
export type {ChatMedia} from './chat-media-types';

export default function ChatMediaView({media,token,compact=false,onOpen,canRepair=false}:{
 media:ChatMedia;token:string;compact?:boolean;onOpen:(assetId:string)=>void;canRepair?:boolean;
}){
 const {surface,preview,poster,error,posterMissing,reloadPoster}=useChatMediaPreview(media,token);
 const [repairing,setRepairing]=useState(false);
 const repairRequest=useRef<AbortController|null>(null);
 useEffect(()=>{setRepairing(false);return()=>{repairRequest.current?.abort();repairRequest.current=null;};},[media.assetId,token]);
 const repair=async()=>{
  if(!canRepair||!posterMissing||repairRequest.current)return;
  const ctl=new AbortController();repairRequest.current=ctl;setRepairing(true);
  const timer=setTimeout(()=>ctl.abort(),14000);
  try{
   const grant=await requestChatMediaUrl(media.assetId,token,ctl.signal);
   const status=await fetch(chatVideoPosterUrl(grant),{method:'GET',signal:ctl.signal});
   if(status.ok){if(!ctl.signal.aborted)reloadPoster();return;}
   if(status.status!==404)return;
   const {makeRemoteChatVideoPoster}=await import('./chat-video-poster');
   const jpeg=await makeRemoteChatVideoPoster(grant,ctl.signal);
   if(!jpeg||ctl.signal.aborted)return;
   const response=await fetch(API+'/api/chat/media/'+encodeURIComponent(media.assetId)+'/poster',{
    method:'PUT',signal:ctl.signal,headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg'},body:jpeg});
   if(response.ok&&!ctl.signal.aborted)reloadPoster();
  }catch{/* Recovery is optional; preserve original. */}
  finally{clearTimeout(timer);if(repairRequest.current===ctl){repairRequest.current=null;setRepairing(false);}}
 };
 return <div ref={surface} className={'hn-chat-media'+(compact?' is-tile':'')}>
  {media.kind==='audio'?<ChatVoiceMessage media={media} token={token}/>:
   media.kind==='photo'?
    preview?<button type="button" className="hn-chat-image-button"
      onClick={()=>onOpen(media.assetId)} aria-label="Abrir fotografía original">
      <img src={preview} alt="Fotografía enviada" decoding="async" className="hn-chat-photo"/>
    </button>
    :error?<button type="button" className="hn-chat-image-button"
      onClick={()=>onOpen(media.assetId)} aria-label="Abrir fotografía original">
      {error} · Abrir original
    </button>
    :<div className="hn-media-loading hn-photo-placeholder" role="status">Cargando fotografía…</div>
   :<button type="button" className="hn-chat-video-cover"
     onClick={()=>onOpen(media.assetId)} aria-label="Abrir reproductor de video">
     {poster&&<img src={poster} alt="" className="hn-chat-video-poster" decoding="async"/>}
     <span aria-hidden="true">▶</span>
     {!compact&&<span className="hn-chat-video-caption">Ver video</span>}
    </button>}
  {canRepair&&media.kind==='video'&&posterMissing&&<button type="button" className="hn-chat-repair-poster" disabled={repairing}
   onClick={event=>{event.stopPropagation();void repair();}}>{repairing?'Creando…':'Crear portada'}</button>}
 </div>;
}
