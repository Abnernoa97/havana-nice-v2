import {useEffect,useState,type RefObject} from 'react';
import {getChatMediaAvailability,uploadChatMediaBatch,type ChatSession} from '@havana/shared';
import type {usePwaMediaSelection} from './usePwaMediaSelection';

type Selection=ReturnType<typeof usePwaMediaSelection>;
type Options={
 session:ChatSession|null;
 activeSession:RefObject<ChatSession|null>;
 mediaQueue:Selection['mediaQueue'];
 mediaUploadBusy:RefObject<boolean>;
 setMediaError:Selection['setMediaError'];
 waitForMediaPreparation:Selection['waitForMediaPreparation'];
 confirmUploadedMedia:Selection['confirmUploadedMedia'];
 refreshLatest:RefObject<()=>void>;
};

// Only the existing authenticated transport sends files. This hook owns the
// media UI progress, never a second WebSocket, session or R2 implementation.
export function usePwaChatMediaUpload({
 session,activeSession,mediaQueue,mediaUploadBusy,setMediaError,
 waitForMediaPreparation,confirmUploadedMedia,refreshLatest,
}:Options){
  const [mediaReady,setMediaReady]=useState(false);
  const [mediaUploading,setMediaUploading]=useState(false);
  const [mediaProgress,setMediaProgress]=useState(0);
  useEffect(()=>{
    if(!session){setMediaReady(false);return;}
    let live=true;
    void getChatMediaAvailability(session).then(enabled=>{
      if(live)setMediaReady(enabled);
    }).catch(()=>{if(live)setMediaReady(false);});
    return()=>{live=false;};
  },[session?.token]);
  async function sendVoice(file:File,id:string):Promise<boolean>{
    if(!session||mediaUploadBusy.current||!mediaReady)return false;
    if(file.size<=0||file.size>3_000_000){
      setMediaError('Audio inválido o superior a 3 MB.');return false;
    }
    mediaUploadBusy.current=true;setMediaUploading(true);setMediaError('');
    try{
      const {uploadChatFile}=await import('../../services/chat-media-upload');
      await uploadChatFile(session,file,'audio',()=>{},id);
      if(activeSession.current?.token===session.token)refreshLatest.current();
      return true;
    }catch(error){
      setMediaError(error instanceof Error?error.message:'No se pudo enviar el audio.');
      return false;
    }finally{mediaUploadBusy.current=false;setMediaUploading(false);}
  }
  async function sendSelectedMedia(){
    if(!session||!mediaQueue.current.length||mediaUploadBusy.current)return;
    if(!mediaReady){setMediaError('R2 todavía no está disponible.');return;}
    mediaUploadBusy.current=true;setMediaUploading(true);setMediaError('');setMediaProgress(0);
    // Same successful Familia transport, sequential files with 3 parallel parts per video.
    // Never clear a failed file: tapping Enviar resumes its own R2 upload ID.
    try{
      // Keep the R2 ID stable: photo dimensions/bytes are finalized first.
      await waitForMediaPreparation();
      if(activeSession.current?.token!==session.token||!mediaQueue.current.length)return;
      // R2 upload code is downloaded only if the musician actually sends files.
      const {uploadChatFile}=await import('../../services/chat-media-upload');
      const {createChatPhotoThumbnail}=await import('./chat-photo-preview');
      const {storeChatPhotoPreview}=await import('./chat-photo-thumbnail-cache');
      await uploadChatMediaBatch([...mediaQueue.current],{
        sizeOf:item=>item.file.size,
        upload:(item,onSent)=>{
          if(item.selection.kind==='photo'){
            // Prepare sender's cover locally while the original uploads.
            void createChatPhotoThumbnail(item.file).then(thumb=>
              storeChatPhotoPreview(session.token,
                {assetId:item.id,sizeBytes:item.file.size},thumb)
            ).catch(()=>{});
          }
          return uploadChatFile(session,item.file,item.selection.kind,onSent,item.id,
            ()=>item.videoPoster?.blob??null).then(result=>{
             // The sender sees the cover instantly from private cache.
             // The remote JPEG is optional and may roll out separately.
             if(item.videoPoster?.blob)
               void storeChatPhotoPreview(session.token,
                 {assetId:item.id,sizeBytes:item.file.size},item.videoPoster.blob);
             return result;
           });
        },
        progress:setMediaProgress,
        confirmed:item=>confirmUploadedMedia(item.id),
      });
      // The server broadcasts only confirmed media messages in the existing ChatRoom.
      if(activeSession.current)refreshLatest.current();
    }catch(e){
      setMediaError(e instanceof Error?e.message:'La subida se interrumpió. Reintenta los archivos restantes.');
    }finally{mediaUploadBusy.current=false;setMediaUploading(false);}
  }
  return {mediaReady,mediaUploading,mediaProgress,sendSelectedMedia,sendVoice};
}
