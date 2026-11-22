import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,Text,View} from 'react-native';
import {type MemberProfile,type MemberStory} from '@havana/shared';
import {useNativeStories} from './useNativeStories';
import NativeStoryViewer from './NativeStoryViewer';
import {storyStyles as s} from './native-story-styles';

// A failed R2 grant must not leave an invisible circle or repeat requests on
// every render. Show the member's initial until a new photo URL arrives.
const StoryAvatar=React.memo(function StoryAvatar({uri,name,onFailure}:{
 uri:string|null|undefined;name:string;onFailure:()=>void;
}){
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[uri]);
 return uri&&!failed
  ?<Image source={{uri,cache:'default'}} style={s.photo} resizeMode="cover"
    onError={()=>{setFailed(true);onFailure();}}/>
  :<Text style={s.initial}>{name.charAt(0).toUpperCase()}</Text>;
});

type Props={token:string;actorId:string;displayName:string;profiles:readonly MemberProfile[];
 canPublish:boolean;refreshVersion:number};

// HOME story strip has ONE role: pick/add/open. The viewer owns only playback,
// and comments/voice/reactions belong to their own native feature components.
export default function NativeStories({token,actorId,displayName,profiles,canPublish,refreshVersion}:Props){
 const states=useNativeStories(token,refreshVersion);
 const [viewerActor,setViewerActor]=useState<string|null>(null);
 const [emptyMessage,setEmptyMessage]=useState('');
 const group=useMemo(()=>states.stories.filter(st=>st.actorId===viewerActor),
  [states.stories,viewerActor]);
 // Team profiles can be momentarily unavailable while Family refreshes.
 // Stories must still be visible from the authenticated Story API; never
 // discard a teammate's active status just because the profile GET lagged.
 const roster=useMemo(()=>{
  const members=new Map(profiles.map(profile=>[profile.actorId,profile]));
  for(const story of states.stories){
   if(!members.has(story.actorId))members.set(story.actorId,{
    actorId:story.actorId,name:story.name,photoUrl:null
   });
  }
  return [...members.values()];
 },[profiles,states.stories]);
 const own=roster.find(p=>p.actorId===actorId);
 const others=roster.filter(p=>p.actorId!==actorId);
 useEffect(()=>{if(viewerActor&&!group.length)setViewerActor(null);},[viewerActor,group.length]);
 const newest=(id:string)=>states.stories.filter(st=>st.actorId===id)
  .reduce<MemberStory|null>((best,s)=>!best||s.createdAt>best.createdAt||
   (s.createdAt===best.createdAt&&s.id>best.id)?s:best,null);
  const member=(person:{actorId:string;name:string;photoUrl:string|null},self=false)=>{
  const last=newest(person.actorId);
  return <View style={s.member} key={person.actorId}>
   <View style={s.slot}>
    <Pressable accessibilityRole="button"
     accessibilityLabel={last?'Ver estados de '+person.name:'Consultar estados de '+person.name}
     onPress={()=>{
      if(last){setEmptyMessage('');setViewerActor(person.actorId);}
      else setEmptyMessage(self?'Aún no tienes estados.':person.name+' aún no tiene estados.');
     }}
     style={[s.ring,self&&s.ownRing,!!last&&s.activeRing]}>
     <StoryAvatar uri={last?.photoUrl||person.photoUrl} name={person.name}
      onFailure={()=>{if(last)states.retryPhoto(last.id);}}/>
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
 return <>
  <View style={s.row}>
   <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroller}>
    {member({actorId,name:displayName,photoUrl:own?.photoUrl||null},true)}
    {others.map(p=>member(p))}
   </ScrollView>
   {states.saving&&<ActivityIndicator color="#153d31"/>}
   {(!!states.error||states.stories.length===0)&&
    <Pressable accessibilityRole="button" accessibilityLabel="Actualizar estados del equipo"
     onPress={()=>{setEmptyMessage('');states.retryAll();}} style={s.reload}>
     <Text style={s.reloadText}>{states.error||'Sin estados activos'} · Actualizar</Text>
    </Pressable>}
   {!!emptyMessage&&<Text style={s.emptyHint} accessibilityRole="text">{emptyMessage}</Text>}
  </View>
  {viewerActor&&group.length>0&&<NativeStoryViewer key={viewerActor}
   stories={group} token={token} actorId={actorId} version={refreshVersion}
   onClose={()=>setViewerActor(null)} onDelete={states.remove} onPhotoError={states.retryPhoto}/>}
 </>;
}
