// One native player on demand: only play/pause and the timeline are visible.
// This keeps SurfaceView and the video decoder out of chat until the musician taps.
import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {VideoView,useVideoPlayer} from 'expo-video';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
type Media=NonNullable<ChatMessage['media']>;

const format=(seconds:number)=>{
 if(!Number.isFinite(seconds)||seconds<0)return '0:00';
 const s=Math.floor(seconds);
 return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
};
function nativePosterUrl(url:string):string|null{
 try{
  const u=new URL(url);
  if(!u.pathname.endsWith('/file')||!u.searchParams.has('token'))return null;
  u.pathname=u.pathname.slice(0,-4)+'poster';
  return u.toString();
 }catch{return null;}
}

function NativeChatInlineVideo({url,onClose}:{url:string;onClose:()=>void}){
 const {width,height}=useWindowDimensions();
 const player=useVideoPlayer({uri:url},value=>{
  value.loop=false;value.timeUpdateEventInterval=.2;
 });
 const [playing,setPlaying]=useState(false);
 const [time,setTime]=useState(0);
 const [duration,setDuration]=useState(0);
 const [trackWidth,setTrackWidth]=useState(0);
 const [error,setError]=useState(false);
 useEffect(()=>{
  const a=player.addListener('playingChange',event=>setPlaying(event.isPlaying));
  const b=player.addListener('timeUpdate',event=>setTime(event.currentTime));
  const c=player.addListener('sourceLoad',()=>setDuration(player.duration));
  const d=player.addListener('statusChange',event=>{
   if(event.status==='readyToPlay')setDuration(player.duration);
   if(event.status==='error')setError(true);
  });
  const e=player.addListener('playToEnd',()=>setPlaying(false));
  return()=>{player.pause();a.remove();b.remove();c.remove();d.remove();e.remove();};
 },[player]);
 const toggle=()=>{if(playing)player.pause();else player.play();};
 const seek=(x:number)=>{
  if(trackWidth<=0||!Number.isFinite(duration)||duration<=0)return;
  const next=Math.max(0,Math.min(duration,duration*x/trackWidth));
  player.currentTime=next;setTime(next);
 };
 return <View style={s.fullscreen}>
  <View style={s.movie}>
   <VideoView player={player} nativeControls={false} contentFit="contain"
    surfaceType="surfaceView" style={{width,height:Math.max(220,height-85)}}/>
  </View>
  <Pressable accessibilityRole="button" accessibilityLabel="Cerrar video"
   onPress={onClose} style={s.close}><Text style={s.closeText}>×</Text></Pressable>
  {error?<Text style={s.error}>No se pudo reproducir el video.</Text>:
   <Pressable accessibilityRole="button"
    accessibilityLabel={playing?'Pausar video':'Reproducir video'}
    onPress={toggle} style={s.play}><Text style={s.playText}>{playing?'Ⅱ':'▶'}</Text></Pressable>}
  <View style={s.transport}>
   <Text style={s.time}>{format(time)}</Text>
   <Pressable accessibilityRole="adjustable" accessibilityLabel="Posición del video"
    onLayout={event=>setTrackWidth(event.nativeEvent.layout.width)}
    onPress={event=>seek(event.nativeEvent.locationX)} style={s.progressTouch}>
    <View style={s.track}>
     <View style={[s.progress,{width:(Math.max(0,Math.min(1,time/Math.max(duration,1)))*100+'%') as `${number}%`}]}/>
    </View>
   </Pressable>
   <Text style={s.time}>{format(duration)}</Text>
  </View>
 </View>;
}
export default function NativeChatVideo({media,session,width,compact=false}:{
 media:Media;session:ChatSession;width:number;compact?:boolean;
}){
 const [opened,setOpened]=useState(false);
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
   onPress={()=>setOpened(true)} style={[s.cover,{width,height:compact?width:Math.round(width*.64)}]}>
   {signed&&nativePosterUrl(signed)?<Image source={{uri:nativePosterUrl(signed)!}} style={s.coverPhoto}/>:null}
   <View style={s.coverPlay}><Text style={s.coverPlayText}>▶</Text></View>
  </Pressable>
  <Modal visible={opened} animationType="fade" statusBarTranslucent
   onRequestClose={()=>setOpened(false)}>
   {signed?<NativeChatInlineVideo key={signed} url={signed}
    onClose={()=>setOpened(false)}/>:<View style={s.fullscreen}>
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
 movie:{flex:1,alignItems:'center',justifyContent:'center'},
 close:{position:'absolute',top:47,left:16,width:44,height:44,borderRadius:22,
  zIndex:9,backgroundColor:'#25312dbb',borderWidth:1,borderColor:'#ffffff44',
  alignItems:'center',justifyContent:'center'},
 closeText:{color:'#fff',fontSize:30,lineHeight:37},
 play:{position:'absolute',top:'44%',width:74,height:74,borderRadius:37,
  alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#ffffff88',
  backgroundColor:'#182f29bb'},
 playText:{fontSize:32,color:'#fff',marginLeft:3},
 transport:{position:'absolute',left:12,right:12,bottom:35,flexDirection:'row',alignItems:'center',
  gap:11,paddingHorizontal:10,paddingVertical:11,borderRadius:24,backgroundColor:'#111b18d9'},
 progressTouch:{flex:1,height:32,justifyContent:'center'},
 track:{height:4,borderRadius:3,backgroundColor:'#ffffff66',overflow:'hidden'},
 progress:{height:'100%',backgroundColor:'#fff'},
 time:{fontSize:11,color:'#fff'},
 wait:{padding:25,alignItems:'center'},
 error:{color:'#fff',fontSize:13}
});
