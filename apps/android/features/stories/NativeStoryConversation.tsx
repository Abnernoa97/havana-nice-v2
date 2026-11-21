import React,{useEffect,useRef,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,TextInput,View,type GestureResponderEvent} from 'react-native';
import {useAudioPlayer,useAudioPlayerStatus} from 'expo-audio';
import {type StoryEmoji} from '@havana/shared';
import {useNativeStoryConversation} from './useNativeStoryConversation';
import NativeStoryVoiceRecorder from './NativeStoryVoiceRecorder';
import type {NativeStoryBurst} from './NativeStoryReactionShower';

// The same public-to-team conversation as PWA, but 100% React Native.
export default function NativeStoryConversation({token,storyId,version,onPause,onBurst}:{
 token:string;storyId:string;version:number;onPause:(paused:boolean)=>void;
 onBurst:(event:NativeStoryBurst)=>void;
}){
 const api=useNativeStoryConversation(token,storyId,version);
 const [draft,setDraft]=useState('');
 const [expanded,setExpanded]=useState(false);
 const [recording,setRecording]=useState(false);
 const [focused,setFocused]=useState(false);
 const player=useAudioPlayer(null);
 const playback=useAudioPlayerStatus(player);
 const burstId=useRef(0);
 const comments=api.conversation?.comments||[];
 useEffect(()=>{setDraft('');setExpanded(false);setRecording(false);setFocused(false);},[storyId]);
 useEffect(()=>{
  onPause(expanded||recording||focused||api.busy||playback.playing);
  return()=>onPause(false);
 },[onPause,expanded,recording,focused,api.busy,playback.playing]);
 const submit=async()=>{
  if(!draft.trim())return;
  if(await api.text(draft)){setDraft('');setFocused(false);}
 };
 const react=(emoji:StoryEmoji,event:GestureResponderEvent)=>{
  const id=++burstId.current;
  const {pageX,pageY}=event.nativeEvent;
  onBurst({id,emoji,x:pageX,y:pageY});
  void api.react(emoji);
 };
 const emojis:StoryEmoji[]=['❤️','👏','😂'];
 const play=(url:string)=>{
  try{player.replace(url);player.play();}
  catch{/* Expired private R2 grant: new conversation refresh issues new capabilities. */}
 };
 return <View style={[s.panel,recording&&s.recordOnly]}>
  {expanded&&!recording&&<View style={s.comments}>
   <View style={s.commentsTitle}>
    <Text style={s.heading}>Comentarios del equipo</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Cerrar comentarios"
     onPress={()=>setExpanded(false)}><Text style={s.close}>×</Text></Pressable>
   </View>
   <ScrollView keyboardShouldPersistTaps="handled" style={s.commentsScroll}>
    {!comments.length?<Text style={s.empty}>Todavía no hay comentarios.</Text>:
     comments.map(item=><View key={item.id} style={s.comment}>
      <Text style={s.commentName}>{item.name}</Text>
      {item.kind==='text'?<Text style={s.commentBody}>{item.text}</Text>:
       item.voiceUrl?<Pressable accessibilityRole="button" accessibilityLabel={'Reproducir voz de '+item.name}
        onPress={()=>play(item.voiceUrl!)} style={s.voicePlay}>
        <Text style={s.commentBody}>▶ Nota de voz</Text>
       </Pressable>:<Text style={s.commentBody}>Audio no disponible</Text>}
     </View>)}
   </ScrollView>
  </View>}
  {!recording&&<View style={s.actions}>
   {emojis.map(emoji=><Pressable key={emoji} accessibilityRole="button"
    accessibilityLabel={emoji==='❤️'?'Enviar corazones':emoji==='👏'?'Aplaudir':'Enviar risas'}
    onPress={event=>react(emoji,event)} style={s.emoji}>
    <Text style={s.emojiText}>{emoji}</Text>
    {!!api.conversation?.reactions[emoji]&&
     <Text style={s.count}>{api.conversation.reactions[emoji]}</Text>}
   </Pressable>)}
   <Pressable accessibilityRole="button" accessibilityLabel="Comentarios públicos"
    onPress={()=>setExpanded(!expanded)} style={s.commentsButton}>
    <Text style={s.commentsButtonText}>Comentarios{comments.length?' · '+comments.length:''}</Text>
   </Pressable>
  </View>}
  <View style={[s.composer,recording&&s.recordComposer]}>
   {!recording&&<>
    <TextInput accessibilityLabel="Escribir comentario público" placeholder="Comentar…"
     placeholderTextColor="#dce4dc" style={s.input} value={draft}
     maxLength={500} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
     onChangeText={setDraft} returnKeyType="send" onSubmitEditing={()=>void submit()}/>
    <Pressable accessibilityRole="button" accessibilityLabel="Enviar comentario"
     disabled={!draft.trim()||api.busy} onPress={()=>void submit()} style={s.send}>
      <Text style={s.sendGlyph}>➤</Text>
    </Pressable>
   </>}
   <NativeStoryVoiceRecorder disabled={api.busy} onRecording={setRecording}
    onSend={api.voice}/>
  </View>
  {!!api.error&&!recording&&<Text style={s.error}>{api.error}</Text>}
 </View>;
}
const s=StyleSheet.create({
 panel:{position:'absolute',left:0,right:0,bottom:0,zIndex:20,
  paddingHorizontal:12,paddingTop:15,paddingBottom:22,gap:7,
  backgroundColor:'rgba(1,15,9,.72)'},
 recordOnly:{alignItems:'center',justifyContent:'center',paddingVertical:17},
 actions:{flexDirection:'row',gap:7,alignItems:'center'},
 emoji:{flexDirection:'row',alignItems:'center',gap:3,backgroundColor:'#123a2dbb',
  borderRadius:20,borderWidth:1,borderColor:'#ffffff44',paddingHorizontal:8,minHeight:35},
 emojiText:{fontSize:20},count:{color:'#fff',fontSize:10},
 commentsButton:{marginLeft:'auto',paddingHorizontal:5,paddingVertical:10},
 commentsButtonText:{color:'#fff',fontSize:11,fontWeight:'600'},
 composer:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
 recordComposer:{alignSelf:'center'},
 input:{flex:1,minWidth:0,borderRadius:24,borderWidth:1,borderColor:'#ffffff88',
  backgroundColor:'#0d241bcc',paddingHorizontal:12,paddingVertical:8,
  minHeight:40,fontSize:16,color:'#fff'},
 send:{width:39,height:39,borderRadius:20,backgroundColor:'#e4d3ae',
  justifyContent:'center',alignItems:'center'},
 sendGlyph:{color:'#153e2c',fontSize:21},
 comments:{position:'absolute',bottom:'100%',left:10,right:10,maxHeight:280,
  minHeight:80,backgroundColor:'rgba(7,30,18,.97)',borderRadius:16,
  borderWidth:1,borderColor:'#ffffff38',padding:12},
 commentsTitle:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 heading:{fontSize:13,fontWeight:'700',color:'#fff'},
 close:{color:'#fff',fontSize:24,paddingHorizontal:8},
 commentsScroll:{maxHeight:230},
 empty:{color:'#c8d1c8',fontSize:12,marginTop:8},
 comment:{flexDirection:'row',gap:8,flexWrap:'wrap',alignItems:'center',marginVertical:5},
 commentName:{fontSize:12,color:'#ead4aa',fontWeight:'700'},
 commentBody:{fontSize:13,color:'#fff'},
 voicePlay:{paddingVertical:8,paddingHorizontal:11,backgroundColor:'#2f5544',borderRadius:15},
 error:{fontSize:11,color:'#ffbcaf'},
});
