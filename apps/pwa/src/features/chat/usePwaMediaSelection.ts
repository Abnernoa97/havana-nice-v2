// Browser-only camera/gallery controller. The Chat socket, R2 transport and
// authenticated session stay in App; private selected originals can survive a
// system-camera PWA restart in an isolated short-lived IndexedDB draft.
import {useEffect,useRef,useState,type RefObject} from 'react';
import {validateChatMediaSelection,CHAT_MEDIA_MAX_PER_SEND,
 type ChatMediaKind,type ChatMediaSource,type ChatMediaSelection} from '@havana/shared';
import {
 loadChatMediaDraft,saveChatMediaDraft,clearChatMediaDraft,
 type StoredChatMediaItem,
} from './chat-media-draft';

export type PwaQueuedMedia={id:string;file:File;selection:ChatMediaSelection};

const EXTENSION_MIME:Record<string,string>={
 jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
 heic:'image/heic',heif:'image/heif',mp4:'video/mp4',mov:'video/quicktime',
};
function normalizedMediaFile(file:File,kind:ChatMediaKind):File{
 const fallback=kind==='photo'?'.jpg':'.mp4';
 const name=file.name||('havana-'+Date.now()+fallback);
 const extension=name.split('.').pop()?.toLowerCase()||'';
 const mime=(file.type||EXTENSION_MIME[extension]||'').toLowerCase();
 return name===file.name&&mime===file.type?file:
   new File([file],name,{type:mime,lastModified:file.lastModified});
}
function toStored(item:PwaQueuedMedia):StoredChatMediaItem{
 return {id:item.id,file:item.file,kind:item.selection.kind,
   source:item.selection.source,name:item.selection.name,
   mimeType:item.selection.mimeType,sizeBytes:item.selection.sizeBytes};
}

export function usePwaMediaSelection({
 actorId,uploadBusy,onCloseMenu,
}:{
 actorId:string|null;
 uploadBusy:RefObject<boolean>;
 onCloseMenu:()=>void;
}){
 const [selectedMedia,setSelectedMedia]=useState<PwaQueuedMedia[]>([]);
 const [mediaError,setMediaError]=useState('');
 const mediaQueue=useRef<PwaQueuedMedia[]>([]);
 const photosPicker=useRef<HTMLInputElement|null>(null);
 const videoPicker=useRef<HTMLInputElement|null>(null);
 const cameraPicker=useRef<HTMLInputElement|null>(null);
 const persistChain=useRef<Promise<void>>(Promise.resolve());
 const actorRef=useRef(actorId);
 actorRef.current=actorId;
 const persistQueue=(queue:PwaQueuedMedia[])=>{
   if(!actorId)return;
   const records=queue.map(toStored);
   // Serialize writes so removing a sent file cannot be overwritten by an
   // older delayed photo-selection write.
   persistChain.current=persistChain.current.catch(()=>{}).then(async()=>{
     const result=await saveChatMediaDraft(actorId,records);
     if(result==='too-large'&&actorRef.current===actorId)
       setMediaError('Archivo listo para enviar. Por su tamaño no puede recuperarse si el sistema reinicia la app.');
   }).catch(()=>{
     if(actorRef.current===actorId)
       setMediaError('Archivos listos para enviar. No fue posible guardarlos para recuperación automática.');
   });
 };
 const removeSelectedMedia=(id:string)=>{
   if(uploadBusy.current)return;
   const removed=mediaQueue.current.find(item=>item.id===id);
   if(removed)URL.revokeObjectURL(removed.selection.uri);
   mediaQueue.current=mediaQueue.current.filter(item=>item.id!==id);
   setSelectedMedia([...mediaQueue.current]);setMediaError('');
   persistQueue(mediaQueue.current);
 };
 const confirmUploadedMedia=(id:string)=>{
   const removed=mediaQueue.current.find(item=>item.id===id);
   if(removed)URL.revokeObjectURL(removed.selection.uri);
   mediaQueue.current=mediaQueue.current.filter(item=>item.id!==id);
   setSelectedMedia([...mediaQueue.current]);setMediaError('');
   persistQueue(mediaQueue.current);
 };
 const clearSelectedMedia=()=>{
   for(const item of mediaQueue.current)URL.revokeObjectURL(item.selection.uri);
   mediaQueue.current=[];setSelectedMedia([]);setMediaError('');
   persistQueue([]);
 };
 const openGalleryMedia=(kind:ChatMediaKind)=>{
   onCloseMenu();setMediaError('');
   if(uploadBusy.current)return;
   if(mediaQueue.current.length>=CHAT_MEDIA_MAX_PER_SEND){
     setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
   }
   (kind==='photo'?photosPicker:videoPicker).current?.click();
 };
 const openCamera=()=>{
   onCloseMenu();setMediaError('');
   if(uploadBusy.current)return;
   if(mediaQueue.current.length>=CHAT_MEDIA_MAX_PER_SEND){
     setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
   }
   cameraPicker.current?.click();
 };
 const chooseMedia=(source:ChatMediaSource,kind:ChatMediaKind,files:File[])=>{
   if(!files.length||uploadBusy.current)return;
   if(mediaQueue.current.length+files.length>CHAT_MEDIA_MAX_PER_SEND){
     setMediaError('Máximo 5 archivos por envío, entre fotos y videos.');return;
   }
   const normalized=files.map(file=>normalizedMediaFile(file,kind));
   for(const file of normalized){
     const issue=validateChatMediaSelection({
       kind,name:file.name,mimeType:file.type.toLowerCase(),sizeBytes:file.size,
     });
     if(issue){setMediaError(file.name+': '+issue);return;}
   }
   const additions:PwaQueuedMedia[]=normalized.map(file=>{
     const uri=URL.createObjectURL(file);
     return {id:crypto.randomUUID(),file,
       selection:{kind,source,uri,name:file.name,
         mimeType:file.type.toLowerCase(),sizeBytes:file.size}};
   });
   mediaQueue.current=[...mediaQueue.current,...additions];
   setSelectedMedia([...mediaQueue.current]);setMediaError('');
   persistQueue(mediaQueue.current);
 };
 useEffect(()=>{
   if(!actorId)return;
   let active=true;
   void loadChatMediaDraft(actorId).then(items=>{
     if(!active||mediaQueue.current.length)return;
     const restored=items.map(item=>{
       const file=item.file instanceof File?item.file:
         new File([item.file],item.name,{type:item.mimeType});
       return {id:item.id,file,selection:{kind:item.kind,source:item.source,
         uri:URL.createObjectURL(file),name:item.name,mimeType:item.mimeType,
         sizeBytes:item.sizeBytes}} as PwaQueuedMedia;
     });
     if(!active){for(const item of restored)URL.revokeObjectURL(item.selection.uri);return;}
     mediaQueue.current=restored;setSelectedMedia([...restored]);
   }).catch(()=>{});
   return()=>{active=false;};
 },[actorId]);
 // Object URLs are view-only. Never persist or reuse them across app restarts.
 useEffect(()=>()=>{for(const item of mediaQueue.current)
   URL.revokeObjectURL(item.selection.uri);},[]);
 return {selectedMedia,mediaError,setMediaError,mediaQueue,
   photosPicker,videoPicker,cameraPicker,removeSelectedMedia,
   confirmUploadedMedia,clearSelectedMedia,
   openGalleryMedia,openCamera,chooseMedia};
}
