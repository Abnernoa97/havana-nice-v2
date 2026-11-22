import React,{useCallback,useEffect,useState} from 'react';
import {Modal,Pressable,StatusBar,StyleSheet,Text,View} from 'react-native';
import {setAudioModeAsync,useAudioPlaylist,useAudioPlaylistStatus} from 'expo-audio';
import {getAudioTracks,privateAudioUrl,type AudioTrack} from '@havana/shared';
import NativeAudioEditorialView from './NativeAudioEditorialView';
import {publishNativeAudio,registerNativeAudioHandlers,clearNativeAudio} from './nativeAudioStore';

// Expo Audio owns the *only* native player and Android MediaSession.
// The shared editorial WebView surfaces are strictly presentation/gesture layers.
// This stays mounted while the member navigates; Chat and BOOK are untouched.
export default function NativeAudio({token,visible,onClose}:{
 token:string;visible:boolean;onClose:()=>void;
}){
 const [tracks,setTracks]=useState<AudioTrack[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const player=useAudioPlaylist({sources:[],loop:'all'});
 const status=useAudioPlaylistStatus(player);
 const index=Math.max(0,status.currentIndex||0);
 const current=tracks[index]||null;

 const refresh=useCallback(async()=>{
  setLoading(true);
  try{
   const result=await getAudioTracks(token);
   setTracks(result);setError('');
  }catch(e){
   setError(e instanceof Error?e.message:'El audio todavía no está disponible.');
  }finally{setLoading(false);}
 },[token]);
 useEffect(()=>{
  void setAudioModeAsync({
   playsInSilentMode:true,shouldPlayInBackground:true,interruptionMode:'doNotMix'
  }).catch(()=>setError('Audio de fondo no disponible.'));
 },[]);
 // Load the catalog immediately in HOME; opening the lounge then uses a warm
 // native playlist rather than fetching R2 only after the first tap.
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>()=>clearNativeAudio(),[token]);
 useEffect(()=>{
  const wasPlaying=player.playing;
  player.clear();
  for(const track of tracks){
   const source=privateAudioUrl(track.audioUrl);
   if(source)player.add({uri:source});
  }
  if(wasPlaying&&tracks.length)player.play();
 },[tracks,player]);
 useEffect(()=>{
  if(!current)return;
  try{
   player.updateLockScreenMetadata({
    title:current.title,artist:current.artist,albumTitle:current.album,
    ...(privateAudioUrl(current.coverUrl)?{artworkUrl:privateAudioUrl(current.coverUrl)!}:{})
   });
  }catch{/* Metadata becomes available on initial Play. */}
 },[current?.id,current?.coverUrl,player]);
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
 const step=(direction:number)=>{
  if(!tracks.length)return;
  if(direction>0)player.next();else player.previous();
 };
 const select=(position:number)=>{
  if(position===index){play();return;}
  if(position<0||position>=tracks.length)return;
  player.skipTo(position);player.play();
 };
 useEffect(()=>{
  registerNativeAudioHandlers({
   play,next:()=>step(1),previous:()=>step(-1),
   select,seek:time=>{void player.seekTo(time);},
   refresh:()=>{void refresh();}
  });
  return()=>registerNativeAudioHandlers(null);
 });
 useEffect(()=>{
  publishNativeAudio({
   tracks,index,playing:!!status.playing,loading,
   elapsed:status.currentTime||0,duration:status.duration||0,error
  });
 },[tracks,index,status.playing,status.currentTime,status.duration,loading,error]);
 return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen"
  onRequestClose={onClose} statusBarTranslucent={false}>
  <StatusBar barStyle="light-content"/>
  <View style={styles.page}>
   <View style={styles.header}>
    <View><Text style={styles.brand}>HAVANA NICE</Text>
     <Text style={styles.subtitle}>ESPACIO DEL EQUIPO</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel="Cerrar reproductor"
     onPress={onClose} style={styles.close}><Text style={styles.closeLabel}>×</Text></Pressable>
   </View>
   <NativeAudioEditorialView/>
  </View>
 </Modal>;
}
const styles=StyleSheet.create({
 page:{flex:1,backgroundColor:'#f6eee4'},
 header:{backgroundColor:'#102d22',flexDirection:'row',justifyContent:'space-between',
  alignItems:'center',paddingHorizontal:20,paddingTop:17,paddingBottom:17},
 brand:{fontFamily:'serif',fontSize:19,fontWeight:'700',letterSpacing:2.7,color:'#e1cfac'},
 subtitle:{fontSize:10,letterSpacing:1.6,marginTop:8,color:'#e5ede5'},
 close:{height:40,width:40,borderRadius:20,backgroundColor:'#ffffff18',
  alignItems:'center',justifyContent:'center'},
 closeLabel:{fontSize:28,color:'#f5f1e8'}
});
