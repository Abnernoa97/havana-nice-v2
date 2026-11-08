// HAVANA NICE V2 · Native Chat media-picker controller.
// Only the device picker/selection lives here. Uploading, ChatRoom,
// messages, session ownership and R2 grants stay with the existing controller.
import {useState} from 'react';
import {Alert,Keyboard} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {File} from 'expo-file-system';
import {validateChatMediaSelection,CHAT_MEDIA_MAX_PER_SEND,
 type ChatMediaKind,type ChatMediaSource,type ChatMediaSelection} from '@havana/shared';

export type NativeQueuedMedia=ChatMediaSelection&{id:string};

const newMediaSelectionId=()=>String(Date.now())+'-'+Math.random().toString(36).slice(2);

export function useNativeMediaSelection({
 uploadBusy,onCloseMenu
}:{uploadBusy:{current:boolean};onCloseMenu:()=>void}){
 const [selectedMedia,setSelectedMedia]=useState<NativeQueuedMedia[]>([]);
 const [mediaError,setMediaError]=useState('');
 const [mediaPicking,setMediaPicking]=useState(false);
 const chooseNativeMedia=async(source:ChatMediaSource,kind?:ChatMediaKind)=>{
  onCloseMenu();setMediaError('');Keyboard.dismiss();
  if(mediaPicking||uploadBusy.current)return;
  const free=CHAT_MEDIA_MAX_PER_SEND-selectedMedia.length;
  if(free<1){setMediaError('Máximo 5 archivos entre Fotos y Video por envío.');return;}
  setMediaPicking(true);
  try{
   if(source==='camera'){
    const permission=await ImagePicker.requestCameraPermissionsAsync();
    if(!permission.granted){
     Alert.alert('Permiso de cámara','Permite el acceso a la cámara para tomar fotos o videos.');
     return;
    }
   }
   const options:ImagePicker.ImagePickerOptions={
    mediaTypes:source==='camera'?['images','videos']:kind==='photo'?['images']:['videos'],
    allowsEditing:false,quality:1,allowsMultipleSelection:source==='gallery',
    selectionLimit:source==='gallery'?free:1
   };
   const result=source==='camera'
    ?await ImagePicker.launchCameraAsync(options)
    :await ImagePicker.launchImageLibraryAsync(options);
   if(result.canceled||!result.assets?.length)return;
   if(result.assets.length>free){
    setMediaError('Máximo 5 archivos entre Fotos y Video por envío.');return;
   }
   const additions:NativeQueuedMedia[]=[];
   for(const asset of result.assets){
    const pickedKind:ChatMediaKind=asset.type==='video'||asset.mimeType?.startsWith('video/')?'video':'photo';
    const name=asset.fileName||('havana-'+Date.now()+(pickedKind==='photo'?'.jpg':'.mp4'));
    // Android providers may omit file sizes and MIME. Never convert originals.
    const mimeType=(asset.mimeType||
      (pickedKind==='video'?(/\.mov$/i.test(name)?'video/quicktime':'video/mp4'):
       /\.heic$/i.test(name)?'image/heic':
       /\.heif$/i.test(name)?'image/heif':
       /\.png$/i.test(name)?'image/png':
       /\.webp$/i.test(name)?'image/webp':'image/jpeg')).toLowerCase();
    const sizeBytes=asset.fileSize??new File(asset.uri).size;
    const issue=validateChatMediaSelection({kind:pickedKind,name,mimeType,sizeBytes});
    if(issue){setMediaError(name+': '+issue);return;}
    additions.push({id:newMediaSelectionId(),kind:pickedKind,source,uri:asset.uri,name,mimeType,sizeBytes});
   }
   setSelectedMedia(previous=>[...previous,...additions]);
  }catch{
   setMediaError('No se pudo abrir la cámara o la galería. Inténtalo de nuevo.');
  }finally{setMediaPicking(false);}
 };
 return {selectedMedia,setSelectedMedia,mediaError,setMediaError,mediaPicking,chooseNativeMedia};
}
