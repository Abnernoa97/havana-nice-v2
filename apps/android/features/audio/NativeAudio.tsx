import React,{useCallback,useEffect,useState} from 'react';
import {Image,Modal,Pressable,ScrollView,StatusBar,StyleSheet,Text,View} from 'react-native';
import {setAudioModeAsync,useAudioPlaylist,useAudioPlaylistStatus} from 'expo-audio';
import {getAudioTracks,privateAudioUrl,type AudioTrack} from '@havana/shared';

const clock=(value:number)=>!Number.isFinite(value)?'0:00':
 Math.floor(Math.max(0,value)/60)+':'+String(Math.floor(Math.max(0,value)%60)).padStart(2,'0');
// Mounted at the Chat root, not inside a tab: leaving Audio never destroys playback.
// expo-audio owns one MediaSession and one playback service; never create a Chat socket.
export default function NativeAudio({token,visible,onClose}:{
 token:string;visible:boolean;onClose:()=>void;
}){
 const [tracks,setTracks]=useState<AudioTrack[]>([]);
 const [loading,setLoading]=useState(true);
 const [seekWidth,setSeekWidth]=useState(270);
 const [error,setError]=useState('');
 const player=useAudioPlaylist({sources:[],loop:'all'});
 const status=useAudioPlaylistStatus(player);
 const index=status.currentIndex;
 const current=tracks[index]||null;
 const refresh=useCallback(async()=>{
  try{
   const result=await getAudioTracks(token);
   setTracks(result);
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'El audio todavía no está disponible.');}
  finally{setLoading(false);}
 },[token]);
 useEffect(()=>{
  void setAudioModeAsync({
   playsInSilentMode:true,shouldPlayInBackground:true,interruptionMode:'doNotMix'
  }).catch(()=>setError('Audio de fondo no disponible.'));
 },[]);
 useEffect(()=>{if(visible)void refresh();},[visible,refresh]);
 useEffect(()=>{
  // One OS-owned playlist enables actual Next/Previous media actions, not
  // simulated seek buttons. Refresh replaces only this catalog's own queue.
  const wasPlaying=player.playing;
  player.clear();
  for(const track of tracks){
   const source=privateAudioUrl(track.audioUrl);
   if(source)player.add({uri:source});
  }
  if(wasPlaying&&tracks.length)player.play();
 },[tracks]);
 useEffect(()=>{
  if(!current)return;
  try{player.updateLockScreenMetadata({
   title:current.title,artist:current.artist,albumTitle:current.album,
   ...(privateAudioUrl(current.coverUrl)?{artworkUrl:privateAudioUrl(current.coverUrl)!}:{})
  });}catch{/* Lock-screen metadata becomes available on first Play. */}
 },[current?.id,current?.coverUrl]);
 const play=()=>{
  if(!current)return;
  if(status.playing){player.pause();return;}
  try{
   player.setActiveForLockScreen(true,{
    title:current.title,artist:current.artist,albumTitle:current.album,
    ...(privateAudioUrl(current.coverUrl)?{artworkUrl:privateAudioUrl(current.coverUrl)!}:{})
   },{showPreviousTrack:true,showNextTrack:true,showSeekBackward:false,showSeekForward:false});
   player.play();
  }catch{setError('No se pudo iniciar la reproducción.');}
 };
 const next=(direction:number)=>{
  if(!tracks.length)return;
  if(direction>0)player.next();else player.previous();
 };
 const cover=privateAudioUrl(current?.coverUrl||null);
 const progress=Math.min(1,Math.max(0,(status.currentTime||0)/Math.max(1,status.duration||0)));
 return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen"
  onRequestClose={onClose} statusBarTranslucent={false}>
  <StatusBar barStyle="dark-content"/>
  <View style={s.page}>
   <View style={s.header}>
    <View><Text style={s.brand}>HAVANA NICE</Text><Text style={s.subtitle}>AUDIO DEL EQUIPO</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Volver al equipo"
     onPress={onClose} style={s.close}><Text style={s.closeLabel}>×</Text></Pressable>
   </View>
   <ScrollView contentContainerStyle={s.body}>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {loading?<Text style={s.empty}>Abriendo Audio…</Text>:!current?
     <View style={s.empty}><Text style={s.emptyTitle}>Tus audios aparecerán aquí</Text>
      <Text style={s.emptyText}>Administración puede publicar canciones con su portada desde la PWA.</Text></View>:
     <>
      <View style={s.player}>
       <View style={s.art}>
        {cover?<Image source={{uri:cover}} style={s.cover} resizeMode="cover"/>:
         <Text style={s.monogram}>HN</Text>}
       </View>
       <View style={s.info}>
        <Text style={s.overline}>AHORA SUENA</Text>
        <Text style={s.title}>{current.title}</Text><Text style={s.artist}>{current.artist}</Text>
       </View>
       <Pressable accessibilityRole="adjustable" accessibilityLabel="Avanzar en el audio"
        onLayout={event=>setSeekWidth(event.nativeEvent.layout.width)}
        onPress={event=>{
         const position=event.nativeEvent.locationX;
         if(status.duration>0&&seekWidth>0)
          void player.seekTo(status.duration*Math.max(0,Math.min(1,position/seekWidth)));
        }} style={s.progressTouch}>
        <View style={s.progress}><View style={[s.progressFill,{width:(progress*100)+'%'}]}/></View>
       </Pressable>
       <View style={s.times}><Text>{clock(status.currentTime)}</Text><Text>{clock(status.duration)}</Text></View>
       <View style={s.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Audio anterior"
         onPress={()=>next(-1)} style={s.control}><Text style={s.arrow}>‹‹</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={status.playing?'Pausar':'Reproducir'}
         onPress={play} style={s.play}><Text style={s.playLabel}>{status.playing?'Ⅱ':'▶'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Siguiente audio"
         onPress={()=>next(1)} style={s.control}><Text style={s.arrow}>››</Text></Pressable>
       </View>
      </View>
      <View style={s.list}>
       {tracks.map((track,n)=><Pressable key={track.id} accessibilityRole="button"
        accessibilityLabel={'Reproducir '+track.title} onPress={()=>{
         if(index===n){play();return;}
         player.skipTo(n);if(!player.playing)play();
        }} style={[s.row,n===index&&s.rowActive]}>
        {privateAudioUrl(track.coverUrl)?
         <Image source={{uri:privateAudioUrl(track.coverUrl)!}} style={s.thumb}/>:
         <View style={s.thumbPlaceholder}><Text style={s.thumbNote}>♫</Text></View>}
        <View style={s.rowInfo}><Text numberOfLines={1} style={s.rowTitle}>{track.title}</Text>
         <Text numberOfLines={1} style={s.rowArtist}>{track.artist}</Text></View>
        <Text style={s.rowIcon}>{status.playing&&n===index?'Ⅱ':'▶'}</Text>
       </Pressable>)}
      </View>
     </>}
   </ScrollView>
  </View>
 </Modal>;
}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:'#F7F5EF'},header:{paddingHorizontal:20,paddingTop:20,paddingBottom:18,
  backgroundColor:'#fffdf7',flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 brand:{fontFamily:'serif',letterSpacing:2.7,fontSize:19,fontWeight:'700',color:'#16412f'},
 subtitle:{fontSize:10,letterSpacing:1.5,color:'#897755',marginTop:6},
 close:{width:43,height:43,borderRadius:24,backgroundColor:'#ecefe9',alignItems:'center',justifyContent:'center'},
 closeLabel:{fontSize:29,color:'#234b35'},
 body:{padding:20,paddingBottom:70,gap:18},
 player:{backgroundColor:'#fffdf9',borderWidth:1,borderColor:'#e8e2d7',borderRadius:21,
  padding:17,gap:11,alignItems:'center'},
 art:{width:300,height:300,borderRadius:16,overflow:'hidden',backgroundColor:'#123b2d',
  justifyContent:'center',alignItems:'center',maxWidth:'100%'},
 cover:{width:'100%',height:'100%'},
 monogram:{fontSize:64,color:'#dbc398',fontFamily:'serif',letterSpacing:9},
 info:{alignItems:'center',gap:5,paddingVertical:10},
 overline:{fontSize:10,letterSpacing:2,color:'#987b50',fontWeight:'800'},
 title:{fontSize:23,color:'#1d3d30',fontWeight:'700',textAlign:'center'},
 artist:{fontSize:13,color:'#768276'},
 progressTouch:{width:'100%',paddingVertical:10},
 progress:{height:5,borderRadius:4,backgroundColor:'#e2e5dc',overflow:'hidden'},
 progressFill:{height:'100%',backgroundColor:'#205b41'},
 times:{width:'100%',flexDirection:'row',justifyContent:'space-between'},
 controls:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:29,marginTop:6},
 control:{width:52,height:53,alignItems:'center',justifyContent:'center'},
 arrow:{fontSize:29,color:'#19432f'},
 play:{width:64,height:64,borderRadius:32,backgroundColor:'#19432f',alignItems:'center',justifyContent:'center'},
 playLabel:{fontSize:23,color:'#fff9ee'},list:{gap:8},
 row:{borderWidth:1,borderColor:'#e6e0d5',backgroundColor:'#fffdf9',padding:10,
  borderRadius:13,flexDirection:'row',alignItems:'center',gap:12},
 rowActive:{backgroundColor:'#e9f1e8',borderColor:'#abc4aa'},
 thumb:{width:45,height:45,borderRadius:9},
 thumbPlaceholder:{width:45,height:45,borderRadius:9,backgroundColor:'#214a37',alignItems:'center',justifyContent:'center'},
 thumbNote:{fontSize:23,color:'#dcc79e'},
 rowInfo:{flex:1,gap:5},rowTitle:{fontWeight:'700',fontSize:13,color:'#203f30'},
 rowArtist:{fontSize:11,color:'#778577'},rowIcon:{fontSize:17,color:'#275842'},
 error:{backgroundColor:'#fff0ea',color:'#aa493e',padding:14,borderRadius:12,fontSize:12},
 empty:{padding:30,backgroundColor:'#fffdf9',borderRadius:14},
 emptyTitle:{fontSize:17,fontWeight:'700',color:'#1a3b2c'},
 emptyText:{fontSize:13,color:'#65776b',marginTop:9,lineHeight:19}
});
