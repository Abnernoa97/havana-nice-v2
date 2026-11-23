// Inline Chat media presentation, independent of the one shared fullscreen viewer.
// The parent timeline owns gallery selection across all loaded messages.
import {useChatMediaPreview} from './useChatMediaPreview';
import ChatVoiceMessage from './ChatVoiceMessage';
import type {ChatMedia} from './chat-media-types';
export type {ChatMedia} from './chat-media-types';

export default function ChatMediaView({media,token,compact=false,onOpen}:{
 media:ChatMedia;token:string;compact?:boolean;onOpen:(assetId:string)=>void;
}){
 const {surface,preview,poster,error}=useChatMediaPreview(media,token);
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
 </div>;
}
