// One fullscreen native mixed-media viewer for all loaded Chat photos/videos.
// Android back and horizontal swipe navigate without remounting Chat.
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {VideoView,useVideoPlayer} from 'expo-video';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {photoPath} from '../../storage/chatPhotoCache';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
type Media=NonNullable<ChatMessage['media']>;
const time=(n:number)=>{
 if(!Number.isFinite(n)||n<0)return '0:00';
 const s=Math.floor(n);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
};
export function NativeChatFilm({url}:{url:string}){
 const {width,height}=useWindowDimensions();
 const player=useVideoPlayer({uri:url},p=>{p.loop=false;p.timeUpdateEventInterval=.2;});
 const [playing,setPlaying]=useState(false),[at,setAt]=useState(0),[duration,setDuration]=useState(0);
 const [bar,setBar]=useState(0);
 const [controlsVisible,setControlsVisible]=useState(true);
 const tapStart=useRef<{x:number;y:number}|null>(null);
 const tapMoved=useRef(false);
 const [ready,setReady]=useState(false),[error,setError]=useState(false),[posterOk,setPosterOk]=useState(true);
 useEffect(()=>{
  const a=player.addListener('playingChange',e=>setPlaying(e.isPlaying));
  const b=player.addListener('timeUpdate',e=>setAt(e.currentTime));
  const c=player.addListener('sourceLoad',()=>{setDuration(player.duration);setReady(true);});
  const d=player.addListener('statusChange',event=>{
   if(event.status==='readyToPlay'){setReady(true);setDuration(player.duration);}
   if(event.status==='error'){setError(true);setReady(false);}
  });
  const e=player.addListener('playToEnd',()=>{setPlaying(false);setControlsVisible(true);});
  return()=>{player.pause();a.remove();b.remove();c.remove();d.remove();e.remove();};
 },[player]);
 const poster=(()=>{
  try{
   const link=new URL(url);
   if(!link.pathname.endsWith('/file')||!link.searchParams.has('token'))return null;
   link.pathname=link.pathname.slice(0,-4)+'poster';return link.toString();
  }catch{return null;}
 })();
 return <View style={s.film}>
  <VideoView player={player} nativeControls={false} contentFit="contain" surfaceType="surfaceView"
   style={{width,height:Math.max(220,height-90)}}/>
  {!ready&&!error&&poster&&posterOk&&<Image source={{uri:poster}} resizeMode="contain"
   onError={()=>setPosterOk(false)}
   style={{position:'absolute',width,height:Math.max(220,height-90)}}/>}
  {!ready&&!error&&<ActivityIndicator color="#fff" style={s.loading}/>}
  {error&&<Text style={s.videoError}>No se pudo reproducir este video.</Text>}
  {!error&&<Pressable accessibilityRole="button"
   accessibilityLabel={controlsVisible?'Ocultar controles del video':'Mostrar controles del video'}
   style={s.videoTap}
   onTouchStart={e=>{tapStart.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};tapMoved.current=false;}}
   onTouchMove={e=>{const start=tapStart.current;if(start&&Math.hypot(e.nativeEvent.pageX-start.x,e.nativeEvent.pageY-start.y)>12)tapMoved.current=true;}}
   onPress={()=>{if(!tapMoved.current)setControlsVisible(v=>!v);}}/>}
  {!error&&controlsVisible&&<Pressable accessibilityRole="button" accessibilityLabel={playing?'Pausar':'Reproducir'}
   style={s.play} onPress={()=>{
    if(playing){player.pause();setControlsVisible(true);}
    else{if(player.duration>0&&player.currentTime>=player.duration-.1)player.currentTime=0;
     player.play();setControlsVisible(false);}
   }}>
   <Text style={s.playText}>{playing?'Ⅱ':'▶'}</Text>
  </Pressable>}
  {ready&&!error&&controlsVisible&&<View style={s.transport}>
   <Text style={s.time}>{time(at)}</Text>
   <Pressable accessibilityRole="adjustable" accessibilityLabel="Tiempo de video"
    style={s.bar} onLayout={e=>setBar(e.nativeEvent.layout.width)}
    onPress={e=>{if(duration>0&&bar>0)player.currentTime=Math.max(0,Math.min(duration,duration*e.nativeEvent.locationX/bar));}}>
    <View style={s.track}>
     <View style={[s.fill,{width:(Math.min(100,at/Math.max(duration,1)*100)+'%') as `${number}%`}]}/>
    </View>
   </Pressable>
   <Text style={s.time}>{time(duration)}</Text>
  </View>}
 </View>;
}
// First render the verified local original. On a cold hit render the R2
// image directly instead of blocking on a complete original-file download.
function Frame({media,session,warmUrl}:{media:Media;session:ChatSession;warmUrl?:string}){
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
 return <NativeChatFilm url={url}/>;
}
export default function NativeChatGallery({items,initial,session,onClose}:{
 items:Media[];initial:number;session:ChatSession;onClose:()=>void;
}){
 const [index,setIndex]=useState(initial);
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
   {current&&<Frame key={current.assetId} media={current} session={session}
    warmUrl={(grants.current.get(current.assetId)?.at??0)>Date.now()-8*60*1000?
     grants.current.get(current.assetId)?.url:undefined}/>} 
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
 counter:{position:'absolute',zIndex:5,top:60,left:78,color:'#fffc',fontSize:12},
 status:{color:'#fff',fontSize:14},
 loading:{position:'absolute',top:'41%',alignSelf:'center'},
 videoError:{position:'absolute',top:'47%',textAlign:'center',color:'#fff',fontSize:13},
 film:{flex:1,width:'100%',alignItems:'center',justifyContent:'center'},
 videoTap:{...StyleSheet.absoluteFillObject,zIndex:1},
 play:{position:'absolute',zIndex:2,top:'44%',width:68,height:68,borderRadius:34,
  backgroundColor:'#193c30c9',alignItems:'center',justifyContent:'center',
  borderWidth:1,borderColor:'#ffffff80'},
 playText:{fontSize:30,color:'#fff'},
 transport:{position:'absolute',zIndex:2,left:12,right:12,bottom:35,flexDirection:'row',
  backgroundColor:'#15251fe3',alignItems:'center',gap:10,borderRadius:23,padding:11},
 time:{color:'#fff',fontSize:11},
 bar:{flex:1,height:30,justifyContent:'center'},
 track:{height:4,borderRadius:3,overflow:'hidden',backgroundColor:'#ffffff66'},
 fill:{height:'100%',backgroundColor:'#fff'},
});
