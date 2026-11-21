import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Animated,AppState,Image,Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {STORY_PLAYBACK_MS,type MemberProfile,type MemberStory} from '@havana/shared';
import {useNativeStories} from './useNativeStories';
import {storyStyles as s} from './native-story-styles';

type Props={token:string;actorId:string;displayName:string;profiles:readonly MemberProfile[];
 canPublish:boolean;refreshVersion:number};
export default function NativeStories({token,actorId,displayName,profiles,canPublish,refreshVersion}:Props){
 const states=useNativeStories(token,refreshVersion);
 const [viewerActor,setViewerActor]=useState<string|null>(null);
 const [position,setPosition]=useState(0);
 const [foreground,setForeground]=useState(true);
 const progress=useRef(new Animated.Value(0)).current;
 const turn=useRef(new Animated.Value(0)).current;
 const group=useMemo(()=>states.stories.filter(st=>st.actorId===viewerActor),
  [states.stories,viewerActor]);
 const shown=group[Math.min(position,group.length-1)];
 const own=profiles.find(p=>p.actorId===actorId);
 const others=profiles.filter(p=>p.actorId!==actorId);
 const open=(id:string)=>{setPosition(0);setViewerActor(id);};
 useEffect(()=>{
  if(viewerActor&&!group.length)setViewerActor(null);
 },[viewerActor,group.length]);
 useEffect(()=>{
  const sub=AppState.addEventListener('change',state=>setForeground(state==='active'));
  return()=>sub.remove();
 },[]);
 useEffect(()=>{
  if(!shown||!foreground)return;
  progress.setValue(0);turn.setValue(0);
  const animation=Animated.timing(progress,{
   toValue:1,duration:STORY_PLAYBACK_MS,easing:undefined,useNativeDriver:true
  });
  const entrance=Animated.timing(turn,{toValue:1,duration:320,useNativeDriver:true});
  entrance.start();
  animation.start(({finished})=>{
   if(!finished)return;
   if(position>=group.length-1)setViewerActor(null);
   else setPosition(p=>p+1);
  });
  return()=>{animation.stop();entrance.stop();};
 },[shown?.id,foreground,group.length,position,progress,turn]);
 const newest=(id:string)=>{
  return states.stories.filter(st=>st.actorId===id)
   .reduce<MemberStory|null>((recent,st)=>!recent||st.createdAt>recent.createdAt||
    (st.createdAt===recent.createdAt&&st.id>recent.id)?st:recent,null);
 };
 const avatar=(url:string|null|undefined,name:string)=>
  url?<Image source={{uri:url}} style={s.photo} resizeMode="cover"
   onError={()=>void states.refresh()}/>:
   <Text style={s.initial}>{name.charAt(0).toUpperCase()}</Text>;
 const member=(person:{actorId:string;name:string;photoUrl:string|null},self=false)=>{
  const newestStory=newest(person.actorId);
  return <View style={s.member} key={person.actorId}>
   <View style={s.slot}>
    <Pressable accessibilityRole="button" disabled={!newestStory}
     accessibilityLabel={newestStory?'Ver estados de '+person.name:'Sin estados de '+person.name}
     onPress={()=>open(person.actorId)}
     style={[s.ring,self&&s.ownRing,!!newestStory&&s.activeRing]}>
     {avatar(newestStory?.photoUrl||person.photoUrl,person.name)}
    </Pressable>
    {self&&<Pressable accessibilityRole="button" accessibilityLabel="Publicar hasta cinco fotos"
     disabled={!canPublish||states.saving} style={s.plus}
     onPress={()=>void states.publish()}>
     <Text style={s.plusText}>+</Text>
    </Pressable>}
   </View>
   <Text style={s.name} numberOfLines={1}>{person.name}</Text>
  </View>;
 };
 const goNext=()=>{
  if(position>=group.length-1)setViewerActor(null);
  else setPosition(p=>p+1);
 };
 return <>
  <View style={s.row}>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroller}>
    {member({actorId,name:displayName,photoUrl:own?.photoUrl||null},true)}
    {others.map(p=>member(p))}
   </ScrollView>
   {states.saving&&<ActivityIndicator color="#153d31"/>}
   {!!states.error&&<Text style={s.error}>{states.error}</Text>}
  </View>
  <Modal transparent animationType="fade" visible={!!shown}
   onRequestClose={()=>setViewerActor(null)}>
   <View style={s.viewerBackdrop}>
    <View style={s.viewer}>
     <View style={s.progressRow}>
      {group.map((photo,index)=><View key={photo.id} style={s.progressTrack}>
       {index<position?<View style={[s.progressFill,{width:'100%'}]}/>:
        index===position?<Animated.View style={[s.progressFill,{
         transform:[{scaleX:progress}],transformOrigin:'left center'}]}/>:null}
      </View>)}
     </View>
     <View style={s.toolbar}>
      <View><Text style={s.viewerName}>{shown?.name}</Text>
       <Text style={s.viewerInfo}>Estado · {position+1} de {group.length}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar estado"
       onPress={()=>setViewerActor(null)}><Text style={s.close}>×</Text></Pressable>
     </View>
     {!!shown&&<Animated.View style={[s.imageStage,{opacity:turn.interpolate({
      inputRange:[0,1],outputRange:[.74,1]
     }),transform:[{perspective:1100},{rotateY:turn.interpolate({
      inputRange:[0,1],outputRange:['-22deg','0deg']
     })}]}]}>
      <Pressable onPress={goNext} style={s.imageTouch} accessibilityRole="button"
       accessibilityLabel="Siguiente estado">
       <Image source={{uri:shown.photoUrl}} style={s.image} resizeMode="contain"
        onError={()=>void states.refresh()}/>
      </Pressable>
     </Animated.View>}
     <View style={s.controls}>
      <Pressable disabled={position===0} accessibilityLabel="Estado anterior"
       onPress={()=>setPosition(Math.max(0,position-1))}>
       <Text style={[s.control,position===0&&{opacity:.3}]}>‹</Text>
      </Pressable>
      {shown?.actorId===actorId&&<Pressable disabled={states.saving}
       accessibilityLabel="Eliminar mi estado" onPress={()=>{if(shown)void states.remove(shown.id);}}>
       <Text style={s.delete}>Eliminar mi estado</Text>
      </Pressable>}
      <Pressable accessibilityLabel="Siguiente estado" onPress={goNext}>
       <Text style={s.control}>›</Text>
      </Pressable>
     </View>
    </View>
   </View>
  </Modal>
 </>;
}
