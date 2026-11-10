// Browser-only camera/gallery controller. The Chat socket, R2 transport and
// authenticated session stay in App; private selected attachments can survive a
// system-camera PWA restart in an isolated short-lived IndexedDB draft.
import {useEffect,useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {validateChatMediaSelection,CHAT_MEDIA_MAX_PER_SEND,
 type ChatMediaKind,type ChatMediaSource,type ChatMediaSelection} from '@havana/shared';
import {
 loadChatMediaDraft,saveChatMediaDraft,
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
 const [photoPreparing,setPhotoPreparing]=useState(false);
 const [mediaError,setMediaError]=useState('');
 const mediaQueue=useRef<PwaQueuedMedia[]>([]);
 const photosPicker=useRef<HTMLInputElement|null>(null);
 const videoPicker=useRef<HTMLInputElement|null>(null);
 const cameraPicker=useRef<HTMLInputElement|null>(null);
 const persistChain=useRef<Promise<void>>(Promise.resolve());
 // Avoid serializing unchanged photos when another video is selected.
 const lastPhotoDraftKey=useRef<string|null>(null);
 const photoEncodeChain=useRef<Promise<void>>(Promise.resolve());
 const photoEncodeTasks=useRef<Map<string,Promise<void>>>(new Map());
 // After the send deadline, never replace an R2-bound file with late output.
 const photoEncodeFrozen=useRef<Set<string>>(new Set());
 const actorRef=useRef(actorId);
 actorRef.current=actorId;
 const mediaOwner=useRef(actorId);
 // Reset the one in-memory preparation queue on actor rotation or cancellation.
 // Late work is still guarded by its original owner and queue membership.
 const resetPhotoPreparation=()=>{
   photoEncodeTasks.current.clear();
   photoEncodeFrozen.current.clear();
   photoEncodeChain.current=Promise.resolve();
   setPhotoPreparing(false);
 };
 // A new authorized member must never inherit the previous member's pending files.
 // Discard only transient object URLs/state, not completed R2 media or Chat caches.
 useLayoutEffect(()=>{
  if(mediaOwner.current===actorId)return;
  mediaOwner.current=actorId;
  lastPhotoDraftKey.current=null;
  resetPhotoPreparation();
  for(const item of mediaQueue.current)URL.revokeObjectURL(item.selection.uri);
  mediaQueue.current=[];
  setSelectedMedia([]);
  setMediaError('');
 },[actorId]);
 const persistQueue=(queue:PwaQueuedMedia[])=>{
   if(!actorId)return;
   // MOV/MP4 originals are never copied to IndexedDB on iOS: five
   // 25MB movies can otherwise saturate the main thread and quota.
   const records=queue.filter(item=>item.selection.kind==='photo').map(toStored);
   const key=actorId+'|'+records.map(item=>item.id+':'+item.sizeBytes).join('|');
   if(lastPhotoDraftKey.current===key)return;
   lastPhotoDraftKey.current=key;
   // Serialize writes so removing a sent file cannot be overwritten by an
   // older delayed photo-selection write.
   persistChain.current=persistChain.current.catch(()=>{}).then(async()=>{
     const result=await saveChatMediaDraft(actorId,records);
     if(result==='too-large'&&actorRef.current===actorId)
       setMediaError('Archivo listo para enviar. Por su tamaño no puede recuperarse si el sistema reinicia la app.');
   }).catch(()=>{
     if(actorRef.current===actorId){
       if(lastPhotoDraftKey.current===key)lastPhotoDraftKey.current=null;
       if(records.length)
         setMediaError('Las fotos están listas, pero no se pudieron guardar para recuperar la selección.');
     }
   });
 };
 // Encode one iPhone image at a time while previews remain interactive.
 const preparePhoto=(item:PwaQueuedMedia,owner:string)=>{
   const task=photoEncodeChain.current.catch(()=>{}).then(async()=>{
     if(actorRef.current!==owner||!mediaQueue.current.includes(item))return;
     const {optimizeChatPhotoUpload}=await import('./chat-photo-upload-optimizer');
     const optimized=await optimizeChatPhotoUpload(item.file);
     if(optimized===item.file||actorRef.current!==owner||
        photoEncodeFrozen.current.has(item.id)||
        !mediaQueue.current.includes(item))return;
     const nextUri=URL.createObjectURL(optimized);
     const oldUri=item.selection.uri;
     item.file=optimized;
     item.selection={...item.selection,name:optimized.name,
       mimeType:optimized.type,sizeBytes:optimized.size,uri:nextUri};
     URL.revokeObjectURL(oldUri);
     setSelectedMedia([...mediaQueue.current]);
   }).catch(()=>{/* An unsupported encoder never blocks a photo. */})
   .finally(()=>{
     photoEncodeTasks.current.delete(item.id);
     if(actorRef.current===owner){
       setPhotoPreparing([...photoEncodeTasks.current.keys()].some(id=>
         !photoEncodeFrozen.current.has(id)));
       if(photoEncodeTasks.current.size===0)persistQueue(mediaQueue.current);
     }
   });
   photoEncodeTasks.current.set(item.id,task);
   setPhotoPreparing(true);
   photoEncodeChain.current=task;
 };
 const waitForMediaPreparation=async()=>{
   if(photoEncodeTasks.current.size===0)return;
   // A user pressing Enviar must never be held hostage by Safari's encoder.
   // Any unfinished task is frozen before R2 reserves a byte length and MIME.
   let deadline:ReturnType<typeof setTimeout>|null=null;
   try{
     await Promise.race([
       Promise.allSettled([...photoEncodeTasks.current.values()]),
       new Promise<void>(resolve=>{deadline=setTimeout(resolve,1500);}),
     ]);
   }finally{
     if(deadline!==null)clearTimeout(deadline);
     for(const id of photoEncodeTasks.current.keys())
       photoEncodeFrozen.current.add(id);
     setPhotoPreparing(false);
   }
 };
 const saveWhenPrepared=()=>{
   if(photoEncodeTasks.current.size===0)persistQueue(mediaQueue.current);
 };
 const removeSelectedMedia=(id:string)=>{
   if(uploadBusy.current)return;
   const removed=mediaQueue.current.find(item=>item.id===id);
   if(removed?.selection.uri)URL.revokeObjectURL(removed.selection.uri);
   mediaQueue.current=mediaQueue.current.filter(item=>item.id!==id);
   setSelectedMedia([...mediaQueue.current]);setMediaError('');
   if(removed?.selection.kind==='photo')saveWhenPrepared();
 };
 const confirmUploadedMedia=(id:string)=>{
   const removed=mediaQueue.current.find(item=>item.id===id);
   if(removed?.selection.uri)URL.revokeObjectURL(removed.selection.uri);
   mediaQueue.current=mediaQueue.current.filter(item=>item.id!==id);
   setSelectedMedia([...mediaQueue.current]);setMediaError('');
   if(removed?.selection.kind==='photo')saveWhenPrepared();
 };
 const clearSelectedMedia=()=>{
   // Reset preparation too; a later selection must not wait behind old files.
   resetPhotoPreparation();
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
   const picker=cameraPicker.current;
   if(!picker)return;
   picker.click();
 };
 const chooseMedia=(source:ChatMediaSource,kind:ChatMediaKind,files:File[])=>{
   if(!files.length||uploadBusy.current||!actorId)return;
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
     const uri=kind==='photo'?URL.createObjectURL(file):'';
     return {id:crypto.randomUUID(),file,
       selection:{kind,source,uri,name:file.name,
         mimeType:file.type.toLowerCase(),sizeBytes:file.size}};
   });
   mediaQueue.current=[...mediaQueue.current,...additions];
   setSelectedMedia([...mediaQueue.current]);setMediaError('');
   // Show immediately, encode in the background; keep only final bytes in draft.
   if(kind==='photo'){
     for(const item of additions)preparePhoto(item,actorId);
   }else saveWhenPrepared();
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
         uri:item.kind==='photo'?URL.createObjectURL(file):'',name:item.name,mimeType:item.mimeType,
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
   openGalleryMedia,openCamera,chooseMedia,waitForMediaPreparation,photoPreparing};
}
