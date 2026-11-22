import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,Text,View} from 'react-native';
import {type MemberProfile,type MemberStory} from '@havana/shared';
import {useNativeStories} from './useNativeStories';
import NativeStoryViewer from './NativeStoryViewer';
import {storyStyles as s} from './native-story-styles';

type Props={token:string;actorId:string;displayName:string;profiles:readonly MemberProfile[];
 canPublish:boolean;refreshVersion:number};

// HOME story strip has ONE role: pick/add/open. The viewer owns only playback,
// and comments/voice/reactions belong to their own native feature components.
export default function NativeStories({token,actorId,displayName,profiles,canPublish,refreshVersion}:Props){
 const states=useNativeStories(token,refreshVersion);
 const [viewerActor,setViewerActor]=useState<string|null>(null);
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
 const avatar=(url:string|null|undefined,name:string)=>
  url?<Image source={{uri:url,cache:'force-cache'}} style={s.photo} resizeMode="cover"
    onError={()=>void states.refresh()}/>:
   <Text style={s.initial}>{name.charAt(0).toUpperCase()}</Text>;
 const member=(person:{actorId:string;name:string;photoUrl:string|null},self=false)=>{
  const last=newest(person.actorId);
  return <View style={s.member} key={person.actorId}>
   <View style={s.slot}>
    <Pressable accessibilityRole="button" disabled={!last}
     accessibilityLabel={last?'Ver estados de '+person.name:'Sin estados de '+person.name}
     onPress={()=>setViewerActor(person.actorId)}
     style={[s.ring,self&&s.ownRing,!!last&&s.activeRing]}>
     {avatar(person.photoUrl||last?.photoUrl,person.name)}
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
   {!!states.error&&<Text style={s.error}>{states.error}</Text>}
  </View>
  {viewerActor&&group.length>0&&<NativeStoryViewer key={viewerActor}
   stories={group} token={token} actorId={actorId} version={refreshVersion}
   onClose={()=>setViewerActor(null)} onDelete={states.remove} onPhotoError={states.retryPhoto}/>}
 </>;
}
