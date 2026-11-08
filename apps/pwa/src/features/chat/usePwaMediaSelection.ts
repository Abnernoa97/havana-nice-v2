// HAVANA NICE V2 · One browser-only camera/gallery selection controller.
// Chat session, R2 upload, message queue and live socket remain in the App.
// This module owns browser object URLs and always revokes them after removal.
import {useEffect,useRef,useState,type RefObject} from 'react';
import {validateChatMediaSelection,CHAT_MEDIA_MAX_PER_SEND,
 type ChatMediaKind,type ChatMediaSource,type ChatMediaSelection} from '@havana/shared';

export type PwaQueuedMedia={id:string;file:File;selection:ChatMediaSelection};

export function usePwaMediaSelection({onCloseMenu}:{onCloseMenu:()=>void}){
 const [selectedMedia,setSelectedMedia]=useState<PwaQueuedMedia[]>([]);
 const [mediaError,setMediaError]=useState('');
 const mediaQueue=useRef<PwaQueuedMedia[]>([]);
 const photosPicker=useRef<HTMLInputElement|null>(null);
 const videoPicker=useRef<HTMLInputElement|null>(null);
 const cameraPicker=useRef<HTMLInputElement|null>(null);
 const removeSelectedMedia=(id:string)=>{
  const removed=mediaQueue.current.find(x=>x.id===id);
  if(removed)URL.revokeObjectURL(removed.selection.uri);
  mediaQueue.current=mediaQueue.current.filter(x=>x.id!==id);
  setSelectedMedia([...mediaQueue.current]);setMediaError('');
 };
 const openGalleryMedia=(kind:ChatMediaKind)=>{
  onCloseMenu();setMediaError('');
  if(mediaQueue.current.length>=CHAT_MEDIA_MAX_PER_SEND){
   setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
  }
  (kind==='photo'?photosPicker:videoPicker).current?.click();
 };
 const openCamera=()=>{
  onCloseMenu();setMediaError('');
  if(mediaQueue.current.length>=CHAT_MEDIA_MAX_PER_SEND){
   setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
  }
  cameraPicker.current?.click();
 };
 const chooseMedia=(source:ChatMediaSource,kind:ChatMediaKind,files:File[])=>{
  if(!files.length)return;
  if(mediaQueue.current.length+files.length>CHAT_MEDIA_MAX_PER_SEND){
   setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
  }
  for(const file of files){
   const issue=validateChatMediaSelection({kind,name:file.name,
    mimeType:file.type.toLowerCase(),sizeBytes:file.size});
   if(issue){setMediaError(file.name+': '+issue);return;}
  }
  const additions=files.map(file=>{
   const uri=URL.createObjectURL(file);
   return {id:crypto.randomUUID(),file,
    selection:{kind,source,uri,name:file.name,
     mimeType:file.type.toLowerCase(),sizeBytes:file.size}} as PwaQueuedMedia;
  });
  mediaQueue.current=[...mediaQueue.current,...additions];
  setSelectedMedia([...mediaQueue.current]);setMediaError('');
 };
 useEffect(()=>()=>{for(const item of mediaQueue.current)
  URL.revokeObjectURL(item.selection.uri);},[]);
 return {selectedMedia,setSelectedMedia,mediaError,setMediaError,
  mediaQueue,photosPicker,videoPicker,cameraPicker,
  removeSelectedMedia,openGalleryMedia,openCamera,chooseMedia};
}
