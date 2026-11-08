import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,Text,View,useWindowDimensions} from 'react-native';
import {photoPath,cacheWholePhoto} from '../../storage/chatPhotoCache';
import {VideoView,useVideoPlayer} from 'expo-video';
import {useEvent} from 'expo';
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
import type {ChatMessage,ChatSession} from '@havana/shared';

type Media=NonNullable<ChatMessage['media']>;
function InlineNativeVideo({url,width,onRetry}:{url:string;width:number;onRetry:()=>void}){
 const player=useVideoPlayer({uri:url},value=>{value.loop=false;});
 const {status}=useEvent(player,'statusChange',{status:player.status});
 return <View style={{width,borderRadius:12,backgroundColor:'#171717'}}>
  {/* Prefer Android's supported primary video surface. TextureView has been
      showing native controls but an entirely black video frame on-device. */}
  <VideoView player={player} nativeControls contentFit="contain"
   surfaceType="surfaceView" style={{width,height:Math.round(width*1.16),borderRadius:12}}/>
  {status==='error'?<Pressable accessibilityRole="button" accessibilityLabel="Reintentar video"
    onPress={onRetry} style={{padding:14,alignItems:'center'}}>
    <Text style={{color:'#fff'}}>No se pudo reproducir. Reintentar</Text>
   </Pressable>:null}
 </View>;
}

export default function NativeChatMediaView({
 media,session
}:{media:Media;session:ChatSession}){
 const [signed,setSigned]=useState('');
 const [videoAttempt,setVideoAttempt]=useState(0);
 const [photo,setPhoto]=useState('');
 const [ratio,setRatio]=useState(1);
 const [enlarged,setEnlarged]=useState(false);
 const [error,setError]=useState('');
 const {width:screenWidth,height:screenHeight}=useWindowDimensions();
 const width=useMemo(()=>Math.max(170,Math.min(350,Math.floor(screenWidth*.85)-28)),[screenWidth]);
 const height=Math.max(60,Math.round(width/ratio));

 useEffect(()=>{
  let active=true;
  const abort=new AbortController();
  setSigned('');setPhoto('');setRatio(1);setError('');setEnlarged(false);
  void (async()=>{
   // Reuse a verified original directly from private app cache, including
   // offline views. No new signed grant or network download is needed.
   if(media.kind==='photo'){
    const cached=photoPath(media);
    if(cached.exists&&cached.size===media.sizeBytes){
     Image.getSize(cached.uri,(w,h)=>{if(active){setRatio(w>0&&h>0?w/h:1);setPhoto(cached.uri);}},()=>{});
     return;
    }
   }
   // Refresh signed URLs only for network reads, never persist them.
   const result=await fetch(API+'/api/chat/media/'+media.assetId+'/grant',{
    headers:{Authorization:'Bearer '+session.token},signal:abort.signal
   });
   if(!result.ok)throw Error('Archivo no disponible');
   const grant=await result.json() as {url?:string};
   const url=grant.url||'';
   if(!url.startsWith(API+'/api/chat/media/'))throw Error('Archivo no disponible');
   if(!active)return;
   setSigned(url);
   if(media.kind!=='photo')return;
   const local=await cacheWholePhoto(media,url);
   if(!active)return;
   Image.getSize(local,(w,h)=>{
    if(active){setRatio(w>0&&h>0?w/h:1);setPhoto(local);}
   },()=>{if(active)setError('No se pudo visualizar la fotografía');});
  })().catch(()=>{if(active)setError('Archivo no disponible');});
  return()=>{active=false;abort.abort();};
 },[media.assetId,media.kind,media.sizeBytes,session.token,videoAttempt]);

 return <View style={{marginVertical:3,alignSelf:'flex-start',maxWidth:'100%'}}>
  {media.kind==='photo'?
    photo?
      <Pressable accessibilityLabel="Ampliar fotografía" accessibilityRole="button"
        onPress={()=>setEnlarged(true)}>
       <Image source={{uri:photo}} resizeMode="contain"
        style={{width,height,borderRadius:12}}/>
      </Pressable>:
      error?<Text style={{color:'#7c4141'}}>{error}</Text>:
       <View style={{width,height:92,alignItems:'center',justifyContent:'center'}}>
        <ActivityIndicator color="#77736d"/>
       </View>
    :signed?<InlineNativeVideo key={signed} url={signed} width={width}
       onRetry={()=>setVideoAttempt(count=>count+1)}/>:
      error?<Text style={{color:'#7c4141'}}>{error}</Text>:
       <View style={{width,height:92,alignItems:'center',justifyContent:'center'}}>
        <ActivityIndicator color="#77736d"/>
       </View>}
  <Modal visible={media.kind==='photo'&&enlarged&&!!photo}
    animationType="fade" transparent statusBarTranslucent
    onRequestClose={()=>setEnlarged(false)}>
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
 </View>;
}
