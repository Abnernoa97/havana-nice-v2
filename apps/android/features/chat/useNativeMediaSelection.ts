// Native camera/gallery selection only. Media originals and pending metadata
// are private to this app; upload, ChatRoom and authentication stay in NativeApp.
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Alert,Keyboard,Platform} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {validateChatMediaSelection,CHAT_MEDIA_MAX_PER_SEND,
 type ChatMediaKind,type ChatMediaSource,type ChatMediaSelection} from '@havana/shared';
import {
 loadNativePendingMedia,storeNativePendingMedia,preserveNativePendingMedia,
 discardNativePendingMedia,clearNativePendingMedia,
} from '../../storage/chatPendingMedia';

export type NativeQueuedMedia=ChatMediaSelection&{id:string};
const newMediaSelectionId=()=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,letter=>{
 const random=Math.floor(Math.random()*16);
 return (letter==='x'?random:(random&3|8)).toString(16);
});

export function useNativeMediaSelection({
 actorId,uploadBusy,onCloseMenu,onRecovered,
}:{
 actorId:string|null;
 uploadBusy:{current:boolean};
 onCloseMenu:()=>void;
 onRecovered:()=>void;
}){
 const [selectedMedia,setSelectedMedia]=useState<NativeQueuedMedia[]>([]);
 const [mediaError,setMediaError]=useState('');
 const [mediaPicking,setMediaPicking]=useState(false);
 const selectedRef=useRef<NativeQueuedMedia[]>([]);
 const actorRef=useRef(actorId);
 actorRef.current=actorId;
 const mediaOwner=useRef(actorId);
 // Queued attachments may only be used by the member who selected them.
 // Do not delete stored originals when a session rotates: storage owns expiry.
 useLayoutEffect(()=>{
  if(mediaOwner.current===actorId)return;
  mediaOwner.current=actorId;
  selectedRef.current=[];
  setSelectedMedia([]);
  setMediaError('');
 },[actorId]);
 const pickingRef=useRef(false);
 const writeChain=useRef<Promise<void>>(Promise.resolve());
 const persist=(items:NativeQueuedMedia[])=>{
   if(!actorId)return;
   writeChain.current=writeChain.current.catch(()=>{}).then(()=>
     storeNativePendingMedia(actorId,items)).catch(()=>{
     if(actorRef.current===actorId)
       setMediaError('Archivos listos. No se pudo proteger la selección para recuperarla tras un reinicio.');
   });
 };
 const confirmUploadedMedia=(id:string)=>{
   const removed=selectedRef.current.find(item=>item.id===id);
   selectedRef.current=selectedRef.current.filter(item=>item.id!==id);
   setSelectedMedia([...selectedRef.current]);persist(selectedRef.current);
   if(removed)discardNativePendingMedia(removed);
 };
 const removeSelectedMedia=(id:string)=>{
   if(uploadBusy.current)return;
   confirmUploadedMedia(id);setMediaError('');
 };
 const clearSelectedMedia=()=>{
   const old=selectedRef.current;selectedRef.current=[];
   setSelectedMedia([]);setMediaError('');
   writeChain.current=writeChain.current.catch(()=>{}).then(()=>clearNativePendingMedia()).catch(()=>{});
   for(const item of old)discardNativePendingMedia(item);
 };
 const appendAssets=async(
   assets:ImagePicker.ImagePickerAsset[],source:ChatMediaSource,
 ):Promise<boolean>=>{
   if(!actorId||actorRef.current!==actorId)return false;
   const free=CHAT_MEDIA_MAX_PER_SEND-selectedRef.current.length;
   if(assets.length>free){
     setMediaError('Máximo 5 archivos entre Fotos y Video por envío.');
     return false;
   }
   const additions:NativeQueuedMedia[]=[];
   for(const asset of assets){
     const kind:ChatMediaKind=asset.type==='video'||asset.mimeType?.startsWith('video/')?'video':'photo';
     const name=asset.fileName||('havana-'+Date.now()+(kind==='photo'?'.jpg':'.mp4'));
     const mimeType=(asset.mimeType||
       (kind==='video'?(/\.mov$/i.test(name)?'video/quicktime':'video/mp4'):
        /\.heic$/i.test(name)?'image/heic':
        /\.heif$/i.test(name)?'image/heif':
        /\.png$/i.test(name)?'image/png':
        /\.webp$/i.test(name)?'image/webp':'image/jpeg')).toLowerCase();
     let sizeBytes=asset.fileSize;
     if(!Number.isSafeInteger(sizeBytes)||!sizeBytes){
       try{sizeBytes=new File(asset.uri).size;}catch{sizeBytes=0;}
     }
     const issue=validateChatMediaSelection({kind,name,mimeType,sizeBytes:sizeBytes||0});
     if(issue){setMediaError(name+': '+issue);return false;}
     additions.push({id:newMediaSelectionId(),kind,source,uri:asset.uri,
       name,mimeType,sizeBytes:sizeBytes!});
   }
   const preserved=await preserveNativePendingMedia(additions);
   if(actorRef.current!==actorId)return false;
   selectedRef.current=[...selectedRef.current,...preserved.items];
   setSelectedMedia([...selectedRef.current]);
   setMediaError(preserved.uncopied?
     'Puedes enviar estos archivos ahora. Si el sistema reinicia la app, los grandes podrían necesitar seleccionarse otra vez.':'');
   persist(selectedRef.current);
   return true;
 };
 useEffect(()=>{
   if(!actorId)return;
   let active=true;
   void (async()=>{
     try{
       const saved=await loadNativePendingMedia(actorId);
       if(!active||actorRef.current!==actorId)return;
       if(saved.length&&!selectedRef.current.length){
         // A saved draft restores silently; it never chooses the initial screen.
         selectedRef.current=saved;setSelectedMedia([...saved]);
       }
     }catch{}
     if(Platform.OS!=='android')return;
     try{
       // Expo officially requires this when Android destroys MainActivity
       // while the system camera/gallery is in the foreground.
       const result=await ImagePicker.getPendingResultAsync();
       if(!active||actorRef.current!==actorId)return;
       if(result&&'assets' in result&&!result.canceled&&result.assets?.length){
         const recovered=await appendAssets(result.assets,'camera');
         if(recovered&&active)onRecovered();
       }
     }catch{
       if(active)setMediaError('No se pudo recuperar la foto de la cámara. Intenta tomarla otra vez.');
     }
   })();
   return()=>{active=false;};
 },[actorId]);

 const chooseNativeMedia=async(source:ChatMediaSource,kind?:ChatMediaKind)=>{
   onCloseMenu();setMediaError('');Keyboard.dismiss();
   if(pickingRef.current||uploadBusy.current)return;
   const free=CHAT_MEDIA_MAX_PER_SEND-selectedRef.current.length;
   if(free<1){setMediaError('Máximo 5 archivos entre Fotos y Video por envío.');return;}
   pickingRef.current=true;setMediaPicking(true);
   try{
     if(source==='camera'){
       const permission=await ImagePicker.requestCameraPermissionsAsync();
       if(!permission.granted){
         Alert.alert('Permiso de cámara','Permite el acceso a la cámara para tomar fotografías.');
         return;
       }
     }
     const options:ImagePicker.ImagePickerOptions={
       mediaTypes:source==='camera'?['images','videos']:kind==='photo'?['images']:['videos'],
       allowsEditing:false,quality:1,
       allowsMultipleSelection:source==='gallery',
       selectionLimit:source==='gallery'?free:1,
     };
     const result=source==='camera'
       ?await ImagePicker.launchCameraAsync(options)
       :await ImagePicker.launchImageLibraryAsync(options);
     if(result.canceled||!result.assets?.length)return;
     await appendAssets(result.assets,source);
   }catch{
     setMediaError('No se pudo abrir la cámara o la galería. Inténtalo de nuevo.');
   }finally{pickingRef.current=false;setMediaPicking(false);}
 };
 return {selectedMedia,mediaError,setMediaError,mediaPicking,
   confirmUploadedMedia,removeSelectedMedia,clearSelectedMedia,chooseNativeMedia};
}
