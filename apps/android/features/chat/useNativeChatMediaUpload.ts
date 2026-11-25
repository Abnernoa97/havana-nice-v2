// Native upload UI state only: no new Chat session, WebSocket, queue or R2 transport.
// The existing Chat controller remains the single owner of message reconciliation.
import {useEffect,useRef,useState,type RefObject} from 'react';
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
 type VoiceDraft={uri:string;id:string;token:string};
 const voiceRef=useRef<VoiceDraft|null>(null);
 const [voiceDraft,setVoiceDraft]=useState<VoiceDraft|null>(null);
 const [voiceSending,setVoiceSending]=useState(false);
 const [voiceError,setVoiceError]=useState('');
 const voiceRequest=useRef<AbortController|null>(null);
 useEffect(()=>{
  voiceRef.current=null;setVoiceDraft(null);setVoiceSending(false);setVoiceError('');
  return()=>{voiceRequest.current?.abort();voiceRequest.current=null;};
 },[session?.token]);
 useEffect(()=>{
  if(!session){setMediaReady(false);return;}
  let active=true;
  void getChatMediaAvailability(session).then(enabled=>{
   if(active)setMediaReady(enabled);
  }).catch(()=>{if(active)setMediaReady(false);});
  return()=>{active=false;};
 },[session?.token]);

 async function sendVoice(uri:string,id:string):Promise<boolean>{
  if(!session||activeSession.current?.token!==session.token||voiceRequest.current)return false;
  const prior=voiceRef.current;
  if(prior&&prior.id!==id)return false;
  const item={uri,id,token:session.token};
  voiceRef.current=item;setVoiceDraft(item);setVoiceError('');
  if(mediaUploadBusy.current){setVoiceError('Audio pendiente. Reintenta cuando termine la otra carga.');return false;}
  // An explicit retry checks authorization/storage at the bounded start endpoint,
  // even if a previous availability GET failed during a network outage.
  let file:File;
  try{
   file=new File(uri);
   if(!file.exists||file.size<=0||file.size>3_000_000)throw Error('El audio está vacío o es mayor a 3 MB.');
  }catch(e){setVoiceError(e instanceof Error?e.message:'No se encontró la grabación.');return false;}
  const ctl=new AbortController();voiceRequest.current=ctl;
  // The shared media lock serializes R2 uploads only. Text can still be sent.
  mediaUploadBusy.current=true;setVoiceSending(true);
  const current=()=>voiceRequest.current===ctl&&activeSession.current?.token===item.token;
  try{
   await uploadNativeChatFile(session,{
    id,kind:'audio',source:'camera',uri,mimeType:'audio/mp4',
    sizeBytes:file.size,name:'Voz.m4a'
   },()=>{},ctl.signal);
   if(current()){
    voiceRef.current=null;setVoiceDraft(null);setVoiceError('');
    syncLatest.current();
   }
   return true;
  }catch(e){
   if(current())setVoiceError(e instanceof Error?e.message:'No se pudo enviar el audio. Reintenta.');
   return false;
  }finally{
   // No old response may clear a new session's draft or update its interface.
   mediaUploadBusy.current=false;
   if(voiceRequest.current===ctl){voiceRequest.current=null;setVoiceSending(false);}
  }
 }
 function discardVoice(){
  if(voiceRequest.current)return;
  voiceRef.current=null;setVoiceDraft(null);setVoiceError('');
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
 return {mediaReady,mediaUploading,mediaProgress,sendVoice,sendSelectedMedia,
  voiceDraft:voiceDraft?.token===session?.token?voiceDraft:null,voiceSending,voiceError,discardVoice};
}
