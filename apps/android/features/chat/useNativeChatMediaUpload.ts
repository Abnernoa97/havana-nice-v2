// Native upload UI state only: no new Chat session, WebSocket, queue or R2 transport.
// The existing Chat controller remains the single owner of message reconciliation.
import {useEffect,useRef,useState,type RefObject} from 'react';
import {File} from 'expo-file-system';
import {getChatMediaAvailability,type ChatSession,type ChatMessage} from '@havana/shared';
import {transferNativeVisualBatch,runNativeTransferStep} from './native-media-transfer';
import {prepareNativeChatFile,uploadNativeChatFile} from '../../services/native-chat-r2-upload';
import {seedConfirmedNativePhoto} from '../../storage/chatPhotoCache';
import type {NativeQueuedMedia} from './useNativeMediaSelection';

type Options={
 session:ChatSession|null;
 activeSession:RefObject<ChatSession|null>;
 selectedMedia:NativeQueuedMedia[];
 mediaUploadBusy:RefObject<boolean>;
 setMediaError:(message:string)=>void;
 confirmUploadedMedia:(id:string)=>void;
 confirmMediaMessage:(media:NonNullable<ChatMessage['media']>,seq:number)=>void;
 syncLatest:RefObject<()=>void>;
};

export function useNativeChatMediaUpload({
 session,activeSession,selectedMedia,mediaUploadBusy,setMediaError,
 confirmUploadedMedia,confirmMediaMessage,syncLatest,
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
 const batchRequest=useRef<AbortController|null>(null);
 useEffect(()=>{
  voiceRef.current=null;setVoiceDraft(null);setVoiceSending(false);setVoiceError('');setMediaUploading(false);setMediaProgress(0);
  return()=>{voiceRequest.current?.abort();voiceRequest.current=null;
   batchRequest.current?.abort();batchRequest.current=null;mediaUploadBusy.current=false;};
 },[session?.token]);
 useEffect(()=>{
  if(!session){setMediaReady(false);return;}
  let active=true;
  void runNativeTransferStep('Disponibilidad multimedia',12_000,()=>getChatMediaAvailability(session)).then(enabled=>{
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
   const result=await uploadNativeChatFile(session,{
    id,kind:'audio',source:'camera',uri,mimeType:'audio/mp4',
    sizeBytes:file.size,name:'Voz.m4a'
   },()=>{},ctl.signal);
   if(current()){
    confirmMediaMessage({assetId:result.id,kind:'audio',mimeType:'audio/mp4',sizeBytes:file.size,name:'Voz.m4a'},result.seq);
    voiceRef.current=null;setVoiceDraft(null);setVoiceError('');
    syncLatest.current();
   }
   return true;
  }catch(e){
   if(current())setVoiceError(e instanceof Error?e.message:'No se pudo enviar el audio. Reintenta.');
   return false;
  }finally{
   // No old response may clear a new session's draft or update its interface.
   if(voiceRequest.current===ctl){mediaUploadBusy.current=false;voiceRequest.current=null;setVoiceSending(false);}
  }
 }
 function discardVoice(){
  if(voiceRequest.current)return;
  voiceRef.current=null;setVoiceDraft(null);setVoiceError('');
 }
 async function sendSelectedMedia(){
  if(!session||activeSession.current?.token!==session.token||!selectedMedia.length||mediaUploadBusy.current)return;
  const ctl=new AbortController();batchRequest.current=ctl;
  const current=()=>batchRequest.current===ctl&&activeSession.current?.token===session.token;
  mediaUploadBusy.current=true;setMediaUploading(true);setMediaProgress(0);setMediaError('');
  try{
   await transferNativeVisualBatch([...selectedMedia],{
    prepare:(item,onSent)=>prepareNativeChatFile(session,item,onSent,ctl.signal),
    progress:value=>{if(current())setMediaProgress(value);},
    confirmed:async(item,result)=>{
     if(!current())return;
     const media={assetId:result.id,kind:item.kind,mimeType:item.mimeType,sizeBytes:item.sizeBytes,name:item.name};
     if(item.kind==='photo')await seedConfirmedNativePhoto(media,item.uri);
     if(!current())return;
     confirmMediaMessage(media,result.seq);
     confirmUploadedMedia(item.id);
    },
   },ctl.signal);
  }catch(e){
   if(current())setMediaError(e instanceof Error?e.message:'Se interrumpió la carga. Reintenta solo lo pendiente.');
  }finally{
   if(current()){syncLatest.current();mediaUploadBusy.current=false;batchRequest.current=null;setMediaUploading(false);}
  }
 }
 const cancelMediaUpload=()=>batchRequest.current?.abort();
 const cancelVoice=()=>voiceRequest.current?.abort();
 return {mediaReady,mediaUploading,mediaProgress,sendVoice,sendSelectedMedia,cancelMediaUpload,cancelVoice,
  voiceDraft:voiceDraft?.token===session?.token?voiceDraft:null,voiceSending,voiceError,discardVoice};
}
