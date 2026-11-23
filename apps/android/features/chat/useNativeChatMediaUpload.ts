// Native upload UI state only: no new Chat session, WebSocket, queue or R2 transport.
// The existing Chat controller remains the single owner of message reconciliation.
import {useEffect,useState,type RefObject} from 'react';
import {File} from 'expo-file-system';
import {getChatMediaAvailability,uploadChatMediaBatch,type ChatSession} from '@havana/shared';
import {uploadNativeChatFile} from '../../services/native-chat-r2-upload';
import type {NativeQueuedMedia} from './useNativeMediaSelection';

type Options={
 session:ChatSession|null;
 activeSession:RefObject<ChatSession|null>;
 selectedMedia:NativeQueuedMedia[];
 mediaUploadBusy:RefObject<boolean>;
 setMediaError:(message:string)=>void;
 confirmUploadedMedia:(id:string)=>void;
 syncLatest:RefObject<()=>void>;
};

export function useNativeChatMediaUpload({
 session,activeSession,selectedMedia,mediaUploadBusy,setMediaError,
 confirmUploadedMedia,syncLatest,
}:Options){
 const [mediaReady,setMediaReady]=useState(false);
 const [mediaUploading,setMediaUploading]=useState(false);
 const [mediaProgress,setMediaProgress]=useState(0);
 useEffect(()=>{
  if(!session){setMediaReady(false);return;}
  let active=true;
  void getChatMediaAvailability(session).then(enabled=>{
   if(active)setMediaReady(enabled);
  }).catch(()=>{if(active)setMediaReady(false);});
  return()=>{active=false;};
 },[session?.token]);

 async function sendVoice(uri:string,id:string):Promise<boolean>{
  if(!session||mediaUploadBusy.current||!mediaReady)return false;
  const file=new File(uri);
  if(!file.exists||file.size<=0||file.size>3_000_000){
   setMediaError('El audio está vacío o es mayor a 3 MB.');return false;
  }
  mediaUploadBusy.current=true;setMediaUploading(true);setMediaError('');
  try{
   await uploadNativeChatFile(session,{
    id,kind:'audio',source:'camera',uri,mimeType:'audio/mp4',
    sizeBytes:file.size,name:'Voz.m4a'
   },()=>{});
   if(activeSession.current?.token===session.token)syncLatest.current();
   return true;
  }catch(e){
   setMediaError(e instanceof Error?e.message:'No se pudo enviar el audio.');
   return false;
  }finally{mediaUploadBusy.current=false;setMediaUploading(false);}
 }
 async function sendSelectedMedia(){
  if(!session||!selectedMedia.length||mediaUploadBusy.current)return;
  if(!mediaReady){setMediaError('El almacenamiento R2 no está disponible.');return;}
  mediaUploadBusy.current=true;setMediaUploading(true);setMediaProgress(0);setMediaError('');
  try{
   await uploadChatMediaBatch([...selectedMedia],{
    sizeOf:item=>item.sizeBytes,
    upload:(item,onSent)=>uploadNativeChatFile(session,item,onSent),
    progress:setMediaProgress,
    confirmed:item=>{
     // Do not remove retryable originals or refresh a different member's Chat.
     if(activeSession.current?.token!==session.token)return;
     confirmUploadedMedia(item.id);
     syncLatest.current();
    },
   });
  }catch(e){
   setMediaError(e instanceof Error?e.message:'Se interrumpió la carga. Reintenta solo lo pendiente.');
  }finally{mediaUploadBusy.current=false;setMediaUploading(false);}
 }
 return {mediaReady,mediaUploading,mediaProgress,sendVoice,sendSelectedMedia};
}
