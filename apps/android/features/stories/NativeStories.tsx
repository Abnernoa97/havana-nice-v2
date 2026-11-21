import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,ScrollView,Text,View} from 'react-native';
import type {MemberProfile} from '@havana/shared';
import {useNativeStories} from './useNativeStories';
import {storyStyles as s} from './native-story-styles';

type Props={token:string;actorId:string;displayName:string;profiles:readonly MemberProfile[];
 canPublish:boolean;refreshVersion:number};
export default function NativeStories({token,actorId,displayName,profiles,canPublish,refreshVersion}:Props){
 const states=useNativeStories(token,refreshVersion);
 const [viewerActor,setViewerActor]=useState<string|null>(null);
 const [position,setPosition]=useState(0);
 const group=states.stories.filter(st=>st.actorId===viewerActor);
 const shown=group[Math.min(position,group.length-1)];
 useEffect(()=>{if(viewerActor&&group.length===0)setViewerActor(null);},[viewerActor,group.length]);
 const own=profiles.find(p=>p.actorId===actorId);
 const others=profiles.filter(p=>p.actorId!==actorId);
 const open=(id:string)=>{setPosition(0);setViewerActor(id);};
 const avatar=(url:string|null|undefined,name:string)=>
  url?<Image source={{uri:url}} style={s.photo}/>:
   <Text style={s.initial}>{name.charAt(0).toUpperCase()}</Text>;
 const member=(person:{actorId:string;name:string;photoUrl:string|null},self=false)=>{
  const hasStory=states.stories.some(st=>st.actorId===person.actorId);
  return <View style={s.member} key={person.actorId}>
   <View style={s.slot}>
    <Pressable accessibilityRole="button" disabled={!hasStory}
     accessibilityLabel={hasStory?'Ver estados de '+person.name:'Sin estados de '+person.name}
     onPress={()=>open(person.actorId)}
     style={[s.ring,self&&s.ownRing,hasStory&&s.activeRing]}>
     {avatar(person.photoUrl,person.name)}
    </Pressable>
    {self&&<Pressable accessibilityRole="button" accessibilityLabel="Publicar estado de 24 horas"
     disabled={!canPublish||states.saving} style={s.plus}
     onPress={()=>void states.publish()}>
     <Text style={s.plusText}>+</Text>
    </Pressable>}
   </View>
   <Text style={s.name} numberOfLines={1}>{person.name}</Text>
  </View>;
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
     <View style={s.toolbar}>
      <View><Text style={s.viewerName}>{shown?.name}</Text>
       <Text style={s.viewerInfo}>Estado · 24 horas</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar estado"
       onPress={()=>setViewerActor(null)}><Text style={s.close}>×</Text></Pressable>
     </View>
     {shown&&<Image source={{uri:shown.photoUrl}} style={s.image} resizeMode="contain"
      onError={()=>void states.refresh()}/>}
     <View style={s.controls}>
      <Pressable disabled={position===0} accessibilityLabel="Estado anterior"
       onPress={()=>setPosition(Math.max(0,position-1))}>
       <Text style={[s.control,position===0&&{opacity:.3}]}>‹</Text>
      </Pressable>
      {shown?.actorId===actorId&&<Pressable disabled={states.saving}
       accessibilityLabel="Eliminar mi estado" onPress={()=>{if(shown)void states.remove(shown.id);}}>
       <Text style={s.delete}>Eliminar mi estado</Text>
      </Pressable>}
      <Pressable accessibilityLabel="Siguiente estado"
       onPress={()=>{
        if(position>=group.length-1)setViewerActor(null);
        else setPosition(position+1);
       }}><Text style={s.control}>›</Text></Pressable>
     </View>
    </View>
   </View>
  </Modal>
 </>;
}
