// Videos only: fetch a temporary media read URL and own the native video
// player. Photos, image cache and upload queues remain completely independent.
import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {VideoView,useVideoPlayer} from 'expo-video';
import {useEvent} from 'expo';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
type Media=NonNullable<ChatMessage['media']>;

function NativeChatInlineVideo({
 url,width,onRetry,
}:{url:string;width:number;onRetry:()=>void}){
 const player=useVideoPlayer({uri:url},value=>{value.loop=false;});
 const {status}=useEvent(player,'statusChange',{status:player.status});
 return <View style={{width,borderRadius:12,backgroundColor:'#171717'}}>
   {/* Android surfaceView avoids the black frames seen with textureView. */}
   <VideoView player={player} nativeControls contentFit="contain"
     surfaceType="surfaceView"
     style={{width,height:Math.round(width*1.16),borderRadius:12}}/>
   {status==='error'&&<Pressable accessibilityRole="button"
     accessibilityLabel="Reintentar video" onPress={onRetry}
     style={{padding:14,alignItems:'center'}}>
     <Text style={{color:'#fff'}}>No se pudo reproducir. Reintentar</Text>
   </Pressable>}
 </View>;
}

export default function NativeChatVideo({
 media,session,width,
}:{media:Media;session:ChatSession;width:number}){
 const [signed,setSigned]=useState('');
 const [attempt,setAttempt]=useState(0);
 const [error,setError]=useState('');
 useEffect(()=>{
   let active=true;
   const abort=new AbortController();
   setSigned('');setError('');
   void requestNativeChatMediaUrl(media.assetId,session.token,abort.signal)
     .then(url=>{if(active)setSigned(url);})
     .catch(()=>{if(active&&!abort.signal.aborted)setError('Archivo no disponible');});
   return()=>{active=false;abort.abort();};
 },[media.assetId,session.token,attempt]);
 if(signed)return <NativeChatInlineVideo key={signed} url={signed} width={width}
   onRetry={()=>setAttempt(n=>n+1)}/>;
 if(error)return <Text style={{color:'#7c4141'}}>{error}</Text>;
 return <View style={{width,height:92,alignItems:'center',justifyContent:'center'}}>
   <ActivityIndicator color="#77736d"/>
 </View>;
}
