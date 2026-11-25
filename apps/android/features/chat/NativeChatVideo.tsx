// One native player on demand: only play/pause and the timeline are visible.
// This keeps SurfaceView and the video decoder out of chat until the musician taps.
import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import NativeMediaFilm from '../shared/NativeMediaFilm';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
type Media=NonNullable<ChatMessage['media']>;

function nativePosterUrl(url:string):string|null{
 try{
  const u=new URL(url);
  if(!u.pathname.endsWith('/file')||!u.searchParams.has('token'))return null;
  u.pathname=u.pathname.slice(0,-4)+'poster';
  return u.toString();
 }catch{return null;}
}

export default function NativeChatVideo({media,session,width,compact=false,onOpen}:{
 media:Media;session:ChatSession;width:number;compact?:boolean;onOpen?:(assetId:string)=>void;
}){
 const [opened,setOpened]=useState(false);
 const [filmChrome,setFilmChrome]=useState(true);
 useEffect(()=>{setFilmChrome(true);},[opened]);
 const [signed,setSigned]=useState('');
 const [attempt,setAttempt]=useState(0);
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!opened)return;
  const abort=new AbortController();let live=true;
  setSigned('');setError('');
  void requestNativeChatMediaUrl(media.assetId,session.token,abort.signal)
   .then(url=>{if(live)setSigned(url);})
   .catch(()=>{if(live&&!abort.signal.aborted)setError('Video no disponible.');});
  return()=>{live=false;abort.abort();};
 },[opened,attempt,media.assetId,session.token]);
 return <>
  <Pressable accessibilityRole="button" accessibilityLabel="Abrir video"
   onPress={()=>onOpen?onOpen(media.assetId):setOpened(true)} style={[s.cover,{width,height:compact?width:Math.round(width*.64)}]}>
   {signed&&nativePosterUrl(signed)?<Image source={{uri:nativePosterUrl(signed)!}} style={s.coverPhoto}/>:null}
   <View style={s.coverPlay}><Text style={s.coverPlayText}>▶</Text></View>
  </Pressable>
  <Modal visible={!onOpen&&opened} animationType="fade" statusBarTranslucent
   onRequestClose={()=>setOpened(false)}>
   {signed?<View style={s.fullscreen}>
    <NativeMediaFilm key={signed} url={signed} onControlsChange={setFilmChrome}/>
    {filmChrome&&<Pressable accessibilityRole="button" accessibilityLabel="Cerrar video"
     onPress={()=>setOpened(false)} style={s.close}><Text style={s.closeText}>×</Text></Pressable>}
   </View>:<View style={s.fullscreen}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cerrar video"
     onPress={()=>setOpened(false)} style={s.close}><Text style={s.closeText}>×</Text></Pressable>
    {error?<Pressable onPress={()=>setAttempt(x=>x+1)} accessibilityRole="button"
      style={s.wait}><Text style={s.error}>{error} Tocar para reintentar</Text></Pressable>:
      <ActivityIndicator color="#fff" size="large"/>}
   </View>}
  </Modal>
 </>;
}
const s=StyleSheet.create({
 cover:{backgroundColor:'#162821',borderRadius:11,overflow:'hidden',
  alignItems:'center',justifyContent:'center'},
 coverPhoto:{position:'absolute',left:0,right:0,top:0,bottom:0,width:'100%',height:'100%'},
 coverPlay:{width:48,height:48,borderRadius:25,backgroundColor:'#0a1d17bb',
  alignItems:'center',justifyContent:'center'},
 coverPlayText:{color:'#fff',fontSize:25,marginLeft:3},
 fullscreen:{flex:1,backgroundColor:'#080b09',alignItems:'center',justifyContent:'center'},
 close:{position:'absolute',top:47,left:16,width:44,height:44,borderRadius:22,
  zIndex:9,backgroundColor:'#25312dbb',borderWidth:1,borderColor:'#ffffff44',
  alignItems:'center',justifyContent:'center'},
 closeText:{color:'#fff',fontSize:30,lineHeight:37},
 wait:{padding:25,alignItems:'center'},
 error:{color:'#fff',fontSize:13}
});
