import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Pressable,ScrollView,Text,View} from 'react-native';
import {type MemberProfile,type MemberStory} from '@havana/shared';
import {useNativeStories} from './useNativeStories';
import NativeStoryViewer from './NativeStoryViewer';
import {storyStyles as s} from './native-story-styles';
import {readNativeSeenStoryIds,saveNativeSeenStoryId} from './native-story-seen-store';

// The permanent avatar NEVER appears as a temporary status cover.
const StoryAvatar=React.memo(function StoryAvatar({uri,profileUri,name,hasStory,onFailure}:{
 uri:string|null|undefined;profileUri:string|null;name:string;
 hasStory:boolean;onFailure:()=>void;
}){
 const [failedUri,setFailedUri]=useState('');
 const [readyUri,setReadyUri]=useState('');
 if(hasStory){
  const ready=!!uri&&readyUri===uri;
  return <View style={s.coverFrame}>
   {!ready&&(profileUri?<Image source={{uri:profileUri,cache:'force-cache'}}
    style={s.photo} resizeMode="cover" fadeDuration={0}/>:
    <Text style={s.initial}>{name.charAt(0).toUpperCase()}</Text>)}
   {!!uri&&failedUri!==uri&&<Image source={{uri,cache:'force-cache'}}
    style={[s.photo,s.coverImage,!ready&&s.coverInvisible]}
    resizeMode="cover" fadeDuration={0} onLoad={()=>setReadyUri(uri)}
    onError={()=>{setFailedUri(uri);onFailure();}}/>}
  </View>;
 }
 return uri&&failedUri!==uri
  ?<Image source={{uri,cache:'force-cache'}} style={s.photo} resizeMode="cover"
    fadeDuration={0} onError={()=>{setFailedUri(uri);onFailure();}}/>
  :<Text style={s.initial}>{name.charAt(0).toUpperCase()}</Text>;
});

type Props={token:string;actorId:string;displayName:string;profiles:readonly MemberProfile[];
 canPublish:boolean;refreshVersion:number;visible:boolean};

// HOME story strip has ONE role: pick/add/open. The viewer owns only playback,
// and comments/voice/reactions belong to their own native feature components.
export default function NativeStories({token,actorId,displayName,profiles,canPublish,refreshVersion,visible}:Props){
 const states=useNativeStories(token,refreshVersion,visible);
 const [viewerActor,setViewerActor]=useState<string|null>(null);
 const [seen,setSeen]=useState<string[]>(()=>readNativeSeenStoryIds(actorId));
 useEffect(()=>{setSeen(readNativeSeenStoryIds(actorId));},[actorId]);
 const seenIds=useMemo(()=>new Set(seen),[seen]);
 const markViewed=(id:string)=>{
  if(seenIds.has(id))return;
  setSeen(saveNativeSeenStoryId(actorId,id));
 };
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
 useEffect(()=>{if(viewerActor&&(!visible||!group.length))setViewerActor(null);},[viewerActor,group.length,visible]);
 // Keep only the small controller state while another module is visible.
 // No hidden native Images, ScrollView, conversation or modal.
 if(!visible)return null;
 const newest=(id:string)=>states.stories.filter(st=>st.actorId===id)
  .reduce<MemberStory|null>((best,s)=>!best||s.createdAt>best.createdAt||
   (s.createdAt===best.createdAt&&s.id>best.id)?s:best,null);
  const member=(person:{actorId:string;name:string;photoUrl:string|null},self=false)=>{
  const last=newest(person.actorId);
  const count=person.actorId===actorId?0:states.stories.filter(st=>
   st.actorId===person.actorId&&!seenIds.has(st.id)).length;
  return <View style={s.member} key={person.actorId}>
   <View style={s.slot}>
    <Pressable accessibilityRole="button"
     accessibilityLabel={last?(count?'Ver '+count+' estados nuevos de ':'Ver estados vistos de ')+person.name:'Consultar estados de '+person.name}
     onPress={()=>{
      if(last){setEmptyMessage('');setViewerActor(person.actorId);}
      else setEmptyMessage(self?'Aún no tienes estados.':person.name+' aún no tiene estados.');
     }}
     style={[s.ring,self&&s.ownRing,!!last&&s.activeRing]}>
     <StoryAvatar uri={last?.photoUrl||person.photoUrl} profileUri={person.photoUrl}
      name={person.name} hasStory={!!last&&states.initialReady}
      onFailure={()=>{if(last)states.retryPhoto(last.id);}}/>
    </Pressable>
    {count>0&&<View pointerEvents="none" style={s.countBadge}>
     <Text style={s.countText}>{count}</Text>
    </View>}
    {self&&<Pressable accessibilityRole="button" accessibilityLabel="Publicar hasta cinco fotos"
     disabled={!canPublish||states.saving} style={s.plus}
     onPress={()=>void states.publish()}>
      <Text style={s.plusText}>+</Text>
    </Pressable>}
   </View>
   <Text style={s.name} numberOfLines={1}>{person.name}</Text>
   {count>0&&<Text style={s.storyLabel}>NUEVOS · {count}</Text>}
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
   onClose={()=>setViewerActor(null)} onDelete={states.remove} onPhotoError={states.retryPhoto}
   onViewed={markViewed}/>}
 </>;
}
