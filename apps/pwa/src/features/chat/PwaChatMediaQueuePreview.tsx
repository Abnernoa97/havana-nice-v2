// Compact 5-file WhatsApp-style tray; originals and upload controller unchanged.
import {CHAT_MEDIA_MAX_PER_SEND} from '@havana/shared';
import type {PwaQueuedMedia} from './usePwaMediaSelection';

type Props={
 selectedMedia:PwaQueuedMedia[];
 mediaUploading:boolean;
 photoPreparing:boolean;
 mediaProgress:number;
 mediaReady:boolean;
 onRemove:(id:string)=>void;
};
export default function PwaChatMediaQueuePreview({selectedMedia,mediaUploading,photoPreparing,mediaProgress,mediaReady,onRemove}:Props){
 const status=mediaUploading?'Enviando '+mediaProgress+' %':
  photoPreparing?'Preparando fotos…':
  mediaReady?'Archivos listos':'Almacenamiento no disponible.';
 return <div className="chat-media-queue is-compact" aria-label="Archivos para enviar">
  <div className="chat-media-queue-heading">
   <small>{selectedMedia.length}/{CHAT_MEDIA_MAX_PER_SEND} archivos</small>
   <small aria-live="polite">{status}</small>
  </div>
  <div className="chat-media-queue-items">
   {selectedMedia.map(item=><div className="chat-queued-thumb" key={item.id}
    role="group" aria-label={item.selection.kind==='photo'?'Fotografía seleccionada':'Video seleccionado'}>
    {item.selection.kind==='photo'?
      <img src={item.selection.uri} alt="Foto seleccionada" decoding="async"/>:
      item.videoPoster?<img src={item.videoPoster.url} alt="Video seleccionado"
       decoding="async"/>:
      <span className="chat-video-file-icon" aria-hidden="true">▶</span>}
    {item.selection.kind==='video'&&<span className="chat-queued-play" aria-hidden="true">▶</span>}
    <button type="button" disabled={mediaUploading} aria-label={'Quitar '+item.selection.name}
     onClick={()=>onRemove(item.id)}>×</button>
   </div>)}
  </div>
  {mediaUploading&&<progress aria-label="Progreso de subida" max={100} value={mediaProgress}/>}
 </div>;
}
