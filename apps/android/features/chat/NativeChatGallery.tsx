// One fullscreen native mixed-media viewer for contiguous photo/video bursts.
// Android back and horizontal swipe navigate without remounting Chat.
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {VideoView,useVideoPlayer} from 'expo-video';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {photoPath,cacheWholePhoto} from '../../storage/chatPhotoCache';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
type Media=NonNullable<ChatMessage['media']>;
const time=(n:number)=>{
 if(!Number.isFinite(n)||n<0)return '0:00';
 const s=Math.floor(n);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
};
function Film({url}:{url:string}){
 const {width,height}=useWindowDimensions();
 const player=useVideoPlayer({uri:url},p=>{p.loop=false;p.timeUpdateEventInterval=.2;});
 const [playing,setPlaying]=useState(false),[at,setAt]=useState(0),[duration,setDuration]=useState(0);
 const [bar,setBar]=useState(0);
 useEffect(()=>{
  const a=player.addListener('playingChange',e=>setPlaying(e.isPlaying));
  const b=player.addListener('timeUpdate',e=>setAt(e.currentTime));
  const c=player.addListener('sourceLoad',()=>setDuration(player.duration));
  return()=>{player.pause();a.remove();b.remove();c.remove();};
 },[player]);
 return <View style={s.film}>
  <VideoView player={player} nativeControls={false} contentFit="contain"
   style={{width,height:Math.max(220,height-90)}}/>
  <Pressable accessibilityRole="button" accessibilityLabel={playing?'Pausar':'Reproducir'}
   style={s.play} onPress={()=>{if(playing)player.pause();else player.play();}}>
   <Text style={s.playText}>{playing?'Ⅱ':'▶'}</Text>
  </Pressable>
  <View style={s.transport}>
   <Text style={s.time}>{time(at)}</Text>
   <Pressable accessibilityRole="adjustable" accessibilityLabel="Tiempo de video"
    style={s.bar} onLayout={e=>setBar(e.nativeEvent.layout.width)}
    onPress={e=>{if(duration>0&&bar>0)player.currentTime=duration*e.nativeEvent.locationX/bar;}}>
    <View style={s.track}>
     <View style={[s.fill,{width:(Math.min(100,at/Math.max(duration,1)*100)+'%') as `${number}%`}]}/>
    </View>
   </Pressable>
   <Text style={s.time}>{time(duration)}</Text>
  </View>
 </View>;
}
function Frame({media,session}:{media:Media;session:ChatSession}){
 const {width,height}=useWindowDimensions();
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  const abort=new AbortController();let live=true;
  void(async()=>{
   if(media.kind==='photo'){
    const cached=photoPath(media);
    if(cached.exists&&cached.size===media.sizeBytes)return cached.uri;
   }
   const grant=await requestNativeChatMediaUrl(media.assetId,session.token,abort.signal);
   return media.kind==='photo'?await cacheWholePhoto(media,grant):grant;
  })().then(uri=>{if(live)setUrl(uri);}).catch(()=>{
   if(live&&!abort.signal.aborted)setError('No se pudo abrir el archivo');
  });
  return()=>{live=false;abort.abort();};
 },[media.assetId,media.sizeBytes,media.kind,session.token]);
 if(error)return <Text style={s.status}>{error}</Text>;
 if(!url)return <ActivityIndicator size="large" color="#fff"/>;
 if(media.kind==='photo')return <Image source={{uri:url}} resizeMode="contain"
  style={{width,height:Math.max(200,height-20)}}/>;
 return <Film url={url}/>;
}
export default function NativeChatGallery({items,initial,session,onClose}:{
 items:Media[];initial:number;session:ChatSession;onClose:()=>void;
}){
 const [index,setIndex]=useState(initial);
 const start=useRef<{x:number;y:number}|null>(null);
 const move=(direction:number)=>setIndex(i=>Math.max(0,Math.min(items.length-1,i+direction)));
 const current=items[index];
 return <Modal visible animationType="fade" statusBarTranslucent
  onRequestClose={onClose}>
  <View style={s.root}
   onTouchStart={e=>{start.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};}}
   onTouchEnd={e=>{
    const from=start.current;start.current=null;
    if(!from)return;
    const dx=e.nativeEvent.pageX-from.x,dy=e.nativeEvent.pageY-from.y;
    if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.2)move(dx<0?1:-1);
   }}>
   {current&&<Frame key={current.assetId} media={current} session={session}/>}
   <Pressable style={s.close} accessibilityRole="button" accessibilityLabel="Cerrar galería"
    onPress={onClose}><Text style={s.x}>×</Text></Pressable>
   <Text style={s.counter}>{index+1}/{items.length}</Text>

  </View>
 </Modal>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:'#0b0e0c',alignItems:'center',justifyContent:'center'},
 close:{position:'absolute',top:46,left:13,width:44,height:44,borderRadius:22,
  backgroundColor:'#17382dcb',alignItems:'center',justifyContent:'center',zIndex:5},
 x:{color:'#fff',fontSize:28},
 counter:{position:'absolute',top:60,left:78,color:'#fffc',fontSize:12},
 left:{position:'absolute',top:'48%',left:6,borderRadius:25,width:43,height:43,
  justifyContent:'center',alignItems:'center',backgroundColor:'#17382dbb'},
 right:{position:'absolute',top:'48%',right:6,borderRadius:25,width:43,height:43,
  justifyContent:'center',alignItems:'center',backgroundColor:'#17382dbb'},
 arrow:{fontSize:30,color:'#fff'},
 status:{color:'#fff',fontSize:14},
 film:{flex:1,alignItems:'center',justifyContent:'center'},
 play:{position:'absolute',top:'44%',width:68,height:68,borderRadius:34,
  backgroundColor:'#193c30c9',alignItems:'center',justifyContent:'center',
  borderWidth:1,borderColor:'#ffffff80'},
 playText:{fontSize:30,color:'#fff'},
 transport:{position:'absolute',left:12,right:12,bottom:35,flexDirection:'row',
  backgroundColor:'#15251fe3',alignItems:'center',gap:10,borderRadius:23,padding:11},
 time:{color:'#fff',fontSize:11},
 bar:{flex:1,height:30,justifyContent:'center'},
 track:{height:4,borderRadius:3,overflow:'hidden',backgroundColor:'#ffffff66'},
 fill:{height:'100%',backgroundColor:'#fff'},
});
