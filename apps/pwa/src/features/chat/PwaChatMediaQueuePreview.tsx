// Presentational Chat attachments: no session, socket, upload, or R2 ownership.
import {CHAT_MEDIA_MAX_PER_SEND} from '@havana/shared';
import type {PwaQueuedMedia} from './usePwaMediaSelection';

type Props={
 selectedMedia:PwaQueuedMedia[];
 mediaUploading:boolean;
 mediaProgress:number;
 mediaReady:boolean;
 onRemove:(id:string)=>void;
};
export default function PwaChatMediaQueuePreview({selectedMedia,mediaUploading,mediaProgress,mediaReady,onRemove}:Props){
 return (
<div className="chat-media-queue" aria-label="Archivos para enviar">
            <small>{selectedMedia.length} de {CHAT_MEDIA_MAX_PER_SEND} archivos · Puedes mezclar Fotos y Video</small>
            <div className="chat-media-queue-items">
            {selectedMedia.map(item=><div key={item.id} className="chat-media-preview">
              {item.selection.kind==='photo'
                ?<img src={item.selection.uri} alt={'Vista previa de '+item.selection.name}/>
                :<video src={item.selection.uri} controls preload="metadata" playsInline aria-label={'Vista previa de '+item.selection.name}/>}
              <div className="chat-media-preview-info">
                <strong>{item.selection.name}</strong>
                <small>{item.selection.kind==='photo'?'Fotografía':'Video'} · {(item.selection.sizeBytes/1048576).toFixed(1)} MB</small>
              </div>
              <button type="button" disabled={mediaUploading} aria-label={'Quitar '+item.selection.name}
                onClick={()=>onRemove(item.id)}>✕</button>
            </div>)}
            </div>
            <small>{mediaUploading?'Subiendo originales a R2 · '+mediaProgress+' %':
              mediaReady?'Originales listos para enviar':'Almacenamiento de archivos aún no configurado.'}</small>
            {mediaUploading&&<progress aria-label="Progreso de subida" max={100} value={mediaProgress} style={{width:'100%'}}/>}
          </div>
 );
}
