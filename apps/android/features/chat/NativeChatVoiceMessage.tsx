// Android inline audio note player. Signed R2 grant obtained only on tap.
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {useAudioPlayer,useAudioPlayerStatus} from 'expo-audio';
import type {ChatMessage,ChatSession} from '@havana/shared';
import {requestNativeChatMediaUrl} from './native-chat-media-grant';
type Media=NonNullable<ChatMessage['media']>;
const stamp=(value:number)=>{
 if(!Number.isFinite(value)||value<0)return '0:00';
 const n=Math.floor(value);return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
};
export default function NativeChatVoiceMessage({media,session}:{media:Media;session:ChatSession}){
 const player=useAudioPlayer(null);
 const status=useAudioPlayerStatus(player);
 const [available,setAvailable]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(''),[bar,setBar]=useState(0);
 const abort=useRef<AbortController|null>(null);
 useEffect(()=>{
  setAvailable(false);setError('');
  return()=>{abort.current?.abort();try{player.pause();}catch{}};
 },[media.assetId,session.token,player]);
 const toggle=async()=>{
  if(busy)return;
  if(available){
   try{if(status.playing)player.pause();else player.play();}
   catch{setError('No se pudo reproducir el audio.');}
   return;
  }
  const ctl=new AbortController();abort.current=ctl;setBusy(true);setError('');
  try{
   const url=await requestNativeChatMediaUrl(media.assetId,session.token,ctl.signal);
   player.replace(url);setAvailable(true);player.play();
  }catch{if(!ctl.signal.aborted)setError('Audio no disponible. Toca para reintentar.');}
  finally{setBusy(false);}
 };
 const duration=Number(status.duration||0),time=Number(status.currentTime||0);
 return <View style={s.root} accessibilityLabel="Mensaje de voz">
  <Pressable accessibilityRole="button" accessibilityLabel={status.playing?'Pausar audio':'Reproducir audio'}
   style={s.play} disabled={busy} onPress={()=>void toggle()}>
   <Text style={s.playText}>{busy?'…':status.playing?'Ⅱ':'▶'}</Text>
  </Pressable>
  <View style={s.body}>
   <View style={s.progress}>
    <Pressable accessibilityRole="adjustable" accessibilityLabel="Tiempo de audio"
     onLayout={e=>setBar(e.nativeEvent.layout.width)}
     onPress={e=>{
      if(duration>0&&bar>0)void player.seekTo(Math.max(0,Math.min(duration,duration*e.nativeEvent.locationX/bar)));
     }} style={s.timeline}>
     <View style={s.track}><View style={[s.fill,{width:(Math.min(100,time/Math.max(duration,1)*100)+'%') as `${number}%`}]}/></View>
    </Pressable>
    <Text style={s.time}>{stamp(time)}</Text>
   </View>
   {!!error&&<Text style={s.error}>{error}</Text>}
  </View>
 </View>;
}
const s=StyleSheet.create({
 root:{width:240,maxWidth:'100%',backgroundColor:'#e7eee2',
  padding:8,borderRadius:14,flexDirection:'row',gap:10,alignItems:'center'},
 play:{width:39,height:39,borderRadius:20,backgroundColor:'#174732',
  alignItems:'center',justifyContent:'center'},
 playText:{fontSize:20,color:'#fff'},
 body:{flex:1,justifyContent:'center',gap:5},
 progress:{flexDirection:'row',alignItems:'center',gap:7},
 timeline:{flex:1,height:30,justifyContent:'center'},
 track:{height:4,backgroundColor:'#c3cfc5',borderRadius:5,overflow:'hidden'},
 fill:{height:'100%',backgroundColor:'#174732'},
 time:{fontSize:11,color:'#244e38'},
 error:{fontSize:10,color:'#8e3f31'},
});
