// One native player on demand: only play/pause and the timeline are visible.
// This keeps SurfaceView and the video decoder out of chat until the musician taps.
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import NativeMediaFilm from '../shared/NativeMediaFilm';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
import {publishNativeVideoPoster} from '../../services/native-chat-video-poster';
type Media=NonNullable<ChatMessage['media']>;

function nativePosterUrl(url:string):string|null{
 try{
  const u=new URL(url);
  if(!u.pathname.endsWith('/file')||!u.searchParams.has('token'))return null;
  u.pathname=u.pathname.slice(0,-4)+'poster';
  return u.toString();
 }catch{return null;}
}

export default function NativeChatVideo({media,session,width,compact=false,onOpen,canRepair=false}:{
 media:Media;session:ChatSession;width:number;compact?:boolean;onOpen?:(assetId:string)=>void;canRepair?:boolean;
}){
 const [opened,setOpened]=useState(false);
 const [filmChrome,setFilmChrome]=useState(true);
 useEffect(()=>{setFilmChrome(true);},[opened]);
 const [signed,setSigned]=useState('');
 const [attempt,setAttempt]=useState(0);
 const [error,setError]=useState('');
 const [poster,setPoster]=useState('');
 const [posterMissing,setPosterMissing]=useState(false);
 const [repairing,setRepairing]=useState(false);
 const repairRequest=useRef<AbortController|null>(null);
 // Independent of the fullscreen player: only grant + JPEG when the cell mounts.
 useEffect(()=>{
  const abort=new AbortController();
  setPoster('');setPosterMissing(false);setRepairing(false);
  void requestNativeChatMediaUrl(media.assetId,session.token,abort.signal).then(url=>{
   if(!abort.signal.aborted)setPoster(nativePosterUrl(url)||'');
  }).catch(()=>{});
  return()=>{abort.abort();repairRequest.current?.abort();repairRequest.current=null;};
 },[media.assetId,session.token]);
 const repair=async()=>{
  if(!canRepair||repairRequest.current)return;
  const ctl=new AbortController();repairRequest.current=ctl;setRepairing(true);
  const timer=setTimeout(()=>ctl.abort(),15000);
  try{
   const grant=await requestNativeChatMediaUrl(media.assetId,session.token,ctl.signal);
   const cover=nativePosterUrl(grant);if(!cover)return;
   const status=await fetch(cover,{method:'GET',signal:ctl.signal});
   if(status.ok){if(!ctl.signal.aborted){setPoster(cover);setPosterMissing(false);}return;}
   // Historical recovery is explicit and owner-only. It may read remote video bytes.
   if(status.status!==404)return;
   const saved=await publishNativeVideoPoster(session.token,media.assetId,grant,10000,ctl.signal);
   if(saved&&!ctl.signal.aborted){setPoster(cover);setPosterMissing(false);}
  }catch{/* Missing cover never affects playback. */}
  finally{clearTimeout(timer);if(repairRequest.current===ctl){repairRequest.current=null;setRepairing(false);}}
 };
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
   onPress={()=>onOpen?onOpen(media.assetId):setOpened(true)} style={[s.cover,compact?{width:'100%',height:'100%',borderRadius:5}:{width,height:Math.round(width*.64)}]}>
   {poster?<Image key={poster} source={{uri:poster,cache:'default'}} resizeMode="cover" fadeDuration={0}
    onError={()=>{setPoster('');setPosterMissing(true);}} style={s.coverPhoto}/>:null}
   <View style={s.coverPlay}><Text style={s.coverPlayText}>▶</Text></View>
  </Pressable>
  {canRepair&&posterMissing&&<Pressable accessibilityRole="button" accessibilityLabel="Recuperar portada del video" disabled={repairing}
   onPress={()=>void repair()} style={s.repair}><Text style={s.repairText}>{repairing?'Creando…':'Crear portada'}</Text></Pressable>}
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
 repair:{position:'absolute',bottom:5,right:5,paddingHorizontal:8,paddingVertical:5,borderRadius:9,backgroundColor:'#0a1d17dd'},
 repairText:{fontSize:10,color:'#fff'},
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
