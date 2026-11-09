// Photos only: verified original cache, image aspect ratio, fullscreen modal.
// Video and upload never run here.
import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,Text,View} from 'react-native';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {photoPath,cacheWholePhoto} from '../../storage/chatPhotoCache';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
type Media=NonNullable<ChatMessage['media']>;

export default function NativeChatPhoto({
 media,session,width,screenWidth,screenHeight
}:{media:Media;session:ChatSession;width:number;screenWidth:number;screenHeight:number}){
 const [photo,setPhoto]=useState('');
 const [ratio,setRatio]=useState(1);
 const [enlarged,setEnlarged]=useState(false);
 const [error,setError]=useState('');
 const height=Math.max(60,Math.round(width/ratio));

 useEffect(()=>{
   let active=true;
   const abort=new AbortController();
   setPhoto('');setRatio(1);setError('');setEnlarged(false);
   const display=(uri:string)=>{
     Image.getSize(uri,(w,h)=>{
       if(active){setRatio(w>0&&h>0?w/h:1);setPhoto(uri);}
     },()=>{if(active)setError('No se pudo visualizar la fotografía');});
   };
   void (async()=>{
     const cached=photoPath(media);
     if(cached.exists&&cached.size===media.sizeBytes){
       display(cached.uri);return;
     }
     // Only request a grant when the verified original is not already cached.
     const signed=await requestNativeChatMediaUrl(media.assetId,session.token,abort.signal);
     if(!active||abort.signal.aborted)return;
     const local=await cacheWholePhoto(media,signed);
     if(active)display(local);
   })().catch(()=>{if(active&&!abort.signal.aborted)setError('Archivo no disponible');});
   return()=>{active=false;abort.abort();};
 },[media.assetId,media.sizeBytes,media.mimeType,session.token]);

 return <>
   {photo?
     <Pressable accessibilityLabel="Ampliar fotografía" accessibilityRole="button"
       onPress={()=>setEnlarged(true)}>
       <Image source={{uri:photo}} resizeMode="contain"
         style={{width,height,borderRadius:12}}/>
     </Pressable>:
     error?<Text style={{color:'#7c4141'}}>{error}</Text>:
     <View style={{width,height:92,alignItems:'center',justifyContent:'center'}}>
       <ActivityIndicator color="#77736d"/>
     </View>}
   <Modal visible={enlarged&&!!photo} animationType="fade" transparent
     statusBarTranslucent onRequestClose={()=>setEnlarged(false)}>
     <View style={{flex:1,backgroundColor:'#101010',justifyContent:'center',alignItems:'center'}}>
       <Image source={{uri:photo}} resizeMode="contain"
         style={{width:screenWidth,height:screenHeight}}/>
       <Pressable onPress={()=>setEnlarged(false)} accessibilityRole="button"
         accessibilityLabel="Cerrar fotografía ampliada"
         style={{position:'absolute',top:45,right:18,paddingHorizontal:15,paddingVertical:8,
           borderRadius:24,backgroundColor:'#222'}}>
         <Text style={{fontSize:26,color:'#fff'}}>×</Text>
       </Pressable>
     </View>
   </Modal>
 </>;
}
