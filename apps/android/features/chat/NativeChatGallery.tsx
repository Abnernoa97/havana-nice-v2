// One fullscreen native mixed-media viewer for all loaded Chat photos/videos.
// Android back and horizontal swipe navigate without remounting Chat.
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import NativeMediaFilm from '../shared/NativeMediaFilm';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {photoPath} from '../../storage/chatPhotoCache';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
type Media=NonNullable<ChatMessage['media']>;
// First render the verified local original. On a cold hit render the R2
// image directly instead of blocking on a complete original-file download.
function Frame({media,session,warmUrl,onControlsChange}:{media:Media;session:ChatSession;warmUrl?:string;onControlsChange:(visible:boolean)=>void}){
 const {width,height}=useWindowDimensions();
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  const abort=new AbortController();let live=true;
  setUrl('');setError('');
  void (async()=>{
   if(media.kind==='photo'){
    const cached=photoPath(media);
    if(cached.exists&&cached.size===media.sizeBytes)return cached.uri;
   }
   return warmUrl||await requestNativeChatMediaUrl(media.assetId,session.token,abort.signal);
  })().then(uri=>{if(live)setUrl(uri);}).catch(()=>{
   if(live&&!abort.signal.aborted)setError('Archivo no disponible');
  });
  return()=>{live=false;abort.abort();};
 },[media.assetId,media.sizeBytes,media.kind,session.token,warmUrl]);
 if(error)return <Text style={s.status}>{error}</Text>;
 if(!url)return <ActivityIndicator size="large" color="#fff"/>;
 if(media.kind==='photo')return <Image source={{uri:url}} resizeMode="contain" fadeDuration={0}
  style={{width,height:Math.max(200,height-100)}}/>;
 return <NativeMediaFilm key={url} url={url} onControlsChange={onControlsChange}/>;
}
export default function NativeChatGallery({items,initial,session,onClose}:{
 items:Media[];initial:number;session:ChatSession;onClose:()=>void;
}){
 const [index,setIndex]=useState(initial);
 const [filmChrome,setFilmChrome]=useState(true);
 useEffect(()=>{setFilmChrome(true);},[index]);
 // Short-lived, view-local grants only. Warm the adjacent asset's permission
 // while the current media is visible; do not prefetch enormous originals.
 const grants=useRef(new Map<string,{url:string;at:number}>());
 const [,setRevision]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();
  for(const pos of [index-1,index+1]){
   const item=items[pos];if(!item)continue;
   const cached=grants.current.get(item.assetId);
   if(cached&&Date.now()-cached.at<8*60*1000)continue;
   void requestNativeChatMediaUrl(item.assetId,session.token,abort.signal).then(url=>{
    if(abort.signal.aborted)return;
    grants.current.set(item.assetId,{url,at:Date.now()});setRevision(n=>n+1);
   }).catch(()=>{});
  }
  return()=>abort.abort();
 },[index,items,session.token]);
 const start=useRef<{x:number;y:number}|null>(null);
 const {height:screenHeight}=useWindowDimensions();
 const move=(direction:number)=>setIndex(i=>Math.max(0,Math.min(items.length-1,i+direction)));
 const current=items[index];
 return <Modal visible animationType="fade" statusBarTranslucent
  onRequestClose={onClose}>
  <View style={s.root}
   onTouchStart={e=>{start.current=e.nativeEvent.pageY>screenHeight-90?null:{x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};}}
   onTouchEnd={e=>{
    const from=start.current;start.current=null;
    if(!from)return;
    const dx=e.nativeEvent.pageX-from.x,dy=e.nativeEvent.pageY-from.y;
    if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.2)move(dx<0?1:-1);
   }}>
   {current&&<Frame key={current.assetId} media={current} session={session} onControlsChange={setFilmChrome}
    warmUrl={(grants.current.get(current.assetId)?.at??0)>Date.now()-8*60*1000?
     grants.current.get(current.assetId)?.url:undefined}/>} 
   {(current?.kind!=='video'||filmChrome)&&<>
    <Pressable style={s.close} accessibilityRole="button" accessibilityLabel="Cerrar galería"
     onPress={onClose}><Text style={s.x}>×</Text></Pressable>
    <Text style={s.counter}>{index+1}/{items.length}</Text>
   </>}

  </View>
 </Modal>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:'#0b0e0c',alignItems:'center',justifyContent:'center'},
 close:{position:'absolute',top:46,left:13,width:44,height:44,borderRadius:22,
  backgroundColor:'#17382dcb',alignItems:'center',justifyContent:'center',zIndex:5},
 x:{color:'#fff',fontSize:28},
 counter:{position:'absolute',zIndex:5,top:60,left:78,color:'#fffc',fontSize:12},
 status:{color:'#fff',fontSize:14},
});
