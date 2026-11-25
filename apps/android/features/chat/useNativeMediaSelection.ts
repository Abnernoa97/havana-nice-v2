// Native camera/gallery selection only. Media originals and pending metadata
// are private to this app; upload, ChatRoom and authentication stay in NativeApp.
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Alert,AppState,Keyboard,Platform} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {validateChatMediaSelection,CHAT_MEDIA_MAX_PER_SEND,
 type ChatMediaKind,type ChatMediaSource,type ChatMediaSelection} from '@havana/shared';
import {
 loadNativePendingMedia,storeNativePendingMedia,preserveNativePendingMedia,
 discardNativePendingMedia,clearNativePendingMedia,isNativePendingStaged,
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
 const pickGeneration=useRef(0);
 const mounted=useRef(true);
 const foregroundCleanup=useRef<(()=>void)|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;foregroundCleanup.current?.();++pickGeneration.current;};},[]);
 const stopPicking=()=>{foregroundCleanup.current?.();foregroundCleanup.current=null;pickingRef.current=false;setMediaPicking(false);};
 const cancelNativePicking=()=>{++pickGeneration.current;stopPicking();};
 useEffect(()=>{cancelNativePicking();},[actorId]);
 const stagingChain=useRef<Promise<void>>(Promise.resolve());
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
   // Paint the picker-owned files first, before any secondary disk copy or
   // SQLite operation. The exact same UUID survives preparation and sending.
   selectedRef.current=[...selectedRef.current,...additions];
   setSelectedMedia([...selectedRef.current]);setMediaError('');
   persist(selectedRef.current);
   const owner=actorId;
   // One serial staging lane, never blocks selection/send. Source remains
   // untouched so a transfer already reading it is safe if its URI is promoted.
   stagingChain.current=stagingChain.current.catch(()=>{}).then(async()=>{
     if(!mounted.current||actorRef.current!==owner)return;
     const live=additions.filter(item=>selectedRef.current.some(current=>current.id===item.id));
     if(!live.length)return;
     const existingBytes=selectedRef.current.filter(item=>!live.some(add=>add.id===item.id)&&isNativePendingStaged(item))
       .reduce((sum,item)=>sum+item.sizeBytes,0);
     const preserved=await preserveNativePendingMedia(live,existingBytes);
     const replacements=new Map(preserved.items.map(item=>[item.id,item]));
     if(!mounted.current||actorRef.current!==owner){
       for(const item of preserved.items)discardNativePendingMedia(item);
       return;
     }
     for(const item of preserved.items){
       if(!selectedRef.current.some(current=>current.id===item.id))discardNativePendingMedia(item);
     }
     selectedRef.current=selectedRef.current.map(item=>replacements.get(item.id)??item);
     setSelectedMedia([...selectedRef.current]);persist(selectedRef.current);
     // Picker cache may survive a restart, but only verified copies guarantee
     // a durable pending draft. Do not overwrite a newer upload error.
     if(preserved.uncopied&&!uploadBusy.current&&selectedRef.current.some(item=>live.some(add=>add.id===item.id)))
       setMediaError(previous=>previous||'Archivos disponibles. Los grandes podrían necesitar seleccionarse otra vez tras reiniciar.');
   }).catch(()=>{});
   return true;
 };
 useEffect(()=>{
   if(!actorId)return;
   let active=true;
   const generation=pickGeneration.current;
   void (async()=>{
     try{
       const saved=await loadNativePendingMedia(actorId);
       if(!active||actorRef.current!==actorId)return;
       if(saved.length&&!selectedRef.current.length){
         // A saved draft restores silently; it never chooses the initial screen.
         selectedRef.current=saved;setSelectedMedia([...saved]);
       }
     }catch{}
     if(Platform.OS!=='android'||!active||actorRef.current!==actorId||pickGeneration.current!==generation||pickingRef.current)return;
     try{
       // Expo officially requires this when Android destroys MainActivity
       // while the system camera/gallery is in the foreground.
       const result=await ImagePicker.getPendingResultAsync();
       if(!active||actorRef.current!==actorId||pickGeneration.current!==generation||pickingRef.current)return;
       if(result&&'assets' in result&&!result.canceled&&result.assets?.length){
         const recovered=await appendAssets(result.assets,'camera');
         if(recovered&&active)onRecovered();
       }
     }catch{
       if(active&&actorRef.current===actorId&&pickGeneration.current===generation)setMediaError('No se pudo recuperar la selección. Intenta elegirla otra vez.');
     }
   })();
   return()=>{active=false;};
 },[actorId]);

 const chooseNativeMedia=async(source:ChatMediaSource,kind?:ChatMediaKind)=>{
   onCloseMenu();setMediaError('');Keyboard.dismiss();
   if(!actorId||pickingRef.current||uploadBusy.current)return;
   const free=CHAT_MEDIA_MAX_PER_SEND-selectedRef.current.length;
   if(free<1){setMediaError('Máximo 5 archivos entre Fotos y Video por envío.');return;}
   const generation=++pickGeneration.current;
   const current=()=>mounted.current&&actorRef.current===actorId&&pickGeneration.current===generation;
   pickingRef.current=true;setMediaPicking(true);
   try{
     if(source==='camera'){
       const permission=await ImagePicker.requestCameraPermissionsAsync();
       if(!current())return;
       if(!permission.granted){
         Alert.alert('Permiso de cámara','Permite el acceso a la cámara para tomar fotografías.');
         return;
       }
     }
     if(!current())return;
     // Android can return from the system picker without settling the JS
     // promise after activity recreation. Recover once on foreground, not
     // while the user is still selecting. Both paths share this generation.
     let accepted=false;
     const accept=async(result:ImagePicker.ImagePickerResult)=>{
       if(!current()||accepted)return;
       accepted=true;
       if(result.canceled||!result.assets?.length)return;
       await appendAssets(result.assets,source);
     };
     if(Platform.OS==='android'){
       let returnedTimer:ReturnType<typeof setTimeout>|undefined;
       let recoveryTimer:ReturnType<typeof setTimeout>|undefined;
       let sawBackground=false;
       const sub=AppState.addEventListener('change',state=>{
         if(state!=='active'){sawBackground=true;return;}
         if(!sawBackground||!current()||accepted)return;
         if(recoveryTimer!==undefined)clearTimeout(recoveryTimer);
         if(returnedTimer!==undefined)clearTimeout(returnedTimer);
         recoveryTimer=setTimeout(()=>{
           if(!current()||accepted)return;
           void ImagePicker.getPendingResultAsync().then(result=>{
             if(!current()||accepted||!result||!('assets' in result))return;
             void accept(result).catch(()=>{if(current())setMediaError('No se pudo preparar la selección recuperada.');}).finally(()=>{if(current())stopPicking();});
           }).catch(()=>{});
         },1200);
         returnedTimer=setTimeout(()=>{
           if(!current()||accepted)return;
           // Release the UI only. A late original result is still accepted
           // unless the member starts another selection or cancels it.
           stopPicking();setMediaError('Android sigue preparando la selección. Puedes continuar o elegir los archivos otra vez.');
         },12000);
       });
       foregroundCleanup.current=()=>{sub.remove();if(recoveryTimer!==undefined)clearTimeout(recoveryTimer);if(returnedTimer!==undefined)clearTimeout(returnedTimer);};
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
     await accept(result);
   }catch{
     if(current())setMediaError('No se pudo abrir la cámara o la galería. Inténtalo de nuevo.');
   }finally{if(current())stopPicking();}
 };
 return {selectedMedia,mediaError,setMediaError,mediaPicking,
   confirmUploadedMedia,removeSelectedMedia,clearSelectedMedia,chooseNativeMedia,cancelNativePicking};
}
