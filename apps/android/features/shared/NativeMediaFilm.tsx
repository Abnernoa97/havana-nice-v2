import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {VideoView,useVideoPlayer} from 'expo-video';
// Shared native player: one decoder, one play/pause control, one timeline.
const time=(n:number)=>{
 if(!Number.isFinite(n)||n<0)return '0:00';
 const s=Math.floor(n);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
};
export default function NativeMediaFilm({url,posterUrl,onControlsChange}:{url:string;posterUrl?:string|null;onControlsChange?:(visible:boolean)=>void}){
 const player=useVideoPlayer({uri:url},p=>{p.loop=false;p.timeUpdateEventInterval=.2;});
 const [playing,setPlaying]=useState(false),[at,setAt]=useState(0),[duration,setDuration]=useState(0);
 const [bar,setBar]=useState(0);
 const [controlsVisible,setControlsVisible]=useState(true);
 useEffect(()=>{onControlsChange?.(controlsVisible);},[controlsVisible,onControlsChange]);
 const tapStart=useRef<{x:number;y:number}|null>(null);
 const tapMoved=useRef(false);
 const [ready,setReady]=useState(false),[error,setError]=useState(false),[posterOk,setPosterOk]=useState(true);
 useEffect(()=>{
  const a=player.addListener('playingChange',e=>setPlaying(e.isPlaying));
  const b=player.addListener('timeUpdate',e=>setAt(e.currentTime));
  const c=player.addListener('sourceLoad',()=>{setDuration(player.duration);setReady(true);});
  const d=player.addListener('statusChange',event=>{
   if(event.status==='readyToPlay'){setReady(true);setDuration(player.duration);}
   if(event.status==='error'){setError(true);setReady(false);setControlsVisible(true);}
  });
  const e=player.addListener('playToEnd',()=>{setPlaying(false);setControlsVisible(true);});
  return()=>{player.pause();a.remove();b.remove();c.remove();d.remove();e.remove();};
 },[player]);
 const poster=posterUrl===undefined?(()=>{
  try{
   const link=new URL(url);
   if(!link.pathname.endsWith('/file')||!link.searchParams.has('token'))return null;
   link.pathname=link.pathname.slice(0,-4)+'poster';return link.toString();
  }catch{return null;}
 })():posterUrl;
 return <View style={s.film}>
  <VideoView player={player} nativeControls={false} contentFit="contain" surfaceType="surfaceView"
   style={s.videoSurface}/>
  {!ready&&!error&&poster&&posterOk&&<Image source={{uri:poster}} resizeMode="contain"
   onError={()=>setPosterOk(false)}
   style={[s.videoSurface,s.poster]}/>}
  {!ready&&!error&&<ActivityIndicator color="#fff" style={s.loading}/>}
  {error&&<Text style={s.videoError}>No se pudo reproducir este video.</Text>}
  {!error&&<Pressable accessibilityRole="button"
   accessibilityLabel={controlsVisible?'Ocultar controles del video':'Mostrar controles del video'}
   style={s.videoTap}
   onTouchStart={e=>{tapStart.current={x:e.nativeEvent.pageX,y:e.nativeEvent.pageY};tapMoved.current=false;}}
   onTouchMove={e=>{const start=tapStart.current;if(start&&Math.hypot(e.nativeEvent.pageX-start.x,e.nativeEvent.pageY-start.y)>12)tapMoved.current=true;}}
   onPress={()=>{if(!tapMoved.current)setControlsVisible(v=>player.playing?!v:true);}}/>}
  {!error&&controlsVisible&&<Pressable accessibilityRole="button" accessibilityLabel={playing?'Pausar':'Reproducir'}
   style={s.play} onPress={()=>{
    if(player.playing){player.pause();setControlsVisible(true);}
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
const s=StyleSheet.create({
 videoSurface:{width:'100%',height:'100%'},
 poster:{position:'absolute',top:0,left:0},
 loading:{position:'absolute',top:'41%',alignSelf:'center'},
 videoError:{position:'absolute',top:'47%',textAlign:'center',color:'#fff',fontSize:13},
 film:{flex:1,width:'100%',alignItems:'center',justifyContent:'center'},
 videoTap:{position:'absolute',top:0,right:0,bottom:0,left:0,zIndex:1},
 play:{position:'absolute',zIndex:2,top:'50%',marginTop:-34,width:68,height:68,borderRadius:34,
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
