import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Animated,AppState,Image,Modal,Platform,Pressable,StatusBar,StyleSheet,Text,View} from 'react-native';
import {STORY_PLAYBACK_MS,type MemberStory} from '@havana/shared';
import NativeStoryPhoto from './NativeStoryPhoto';
import NativeStoryConversation from './NativeStoryConversation';
import NativeStoryReactionShower,{type NativeStoryBurst} from './NativeStoryReactionShower';

type Props={stories:readonly MemberStory[];actorId:string;token:string;version:number;
 onClose:()=>void;onDelete:(id:string)=>Promise<boolean>;onPhotoError:(id:string)=>void;
 onViewed:(id:string)=>void};

// Entirely native: ONE stable bitmap, animated progress + floating social controls.
export default function NativeStoryViewer({stories,actorId,token,version,
 onClose,onDelete,onPhotoError,onViewed}:Props){
 const [position,setPosition]=useState(0);
 const [foreground,setForeground]=useState(true);
 const [paused,setPaused]=useState(false);
 const [deleting,setDeleting]=useState(false);
 const [readyStoryId,setReadyStoryId]=useState('');
 const [burst,setBurst]=useState<NativeStoryBurst|null>(null);
 const progress=useRef(new Animated.Value(0)).current;
 const elapsed=useRef(0),lastId=useRef('');
 const viewed=useRef(new Set<string>());
 const current=stories[Math.min(position,stories.length-1)];
 const photoFailed=useCallback(()=>{if(current)onPhotoError(current.id);},[current?.id,onPhotoError]);
 const photoReady=()=>{
  if(!current)return;
  setReadyStoryId(current.id);
  if(!viewed.current.has(current.id)){
   viewed.current.add(current.id);
   onViewed(current.id);
  }
 };
 const goNext=useCallback(()=>{
  if(position>=stories.length-1){onClose();return;}
  setPosition(v=>Math.min(v+1,stories.length-1));
 },[position,stories.length,onClose]);
 const latestNext=useRef(goNext);
 useEffect(()=>{latestNext.current=goNext;},[goNext]);
 useEffect(()=>{
  const sub=AppState.addEventListener('change',status=>setForeground(status==='active'));
  return()=>sub.remove();
 },[]);
 useEffect(()=>{
  const id=current?.id||'';
  if(!id)return;
  if(lastId.current!==id){
   lastId.current=id;elapsed.current=0;progress.setValue(0);
  }
  if(paused||!foreground||deleting||readyStoryId!==id)return;
  const started=Date.now();
  const remain=Math.max(0,STORY_PLAYBACK_MS-elapsed.current);
  const animation=Animated.timing(progress,{toValue:1,duration:remain,useNativeDriver:true});
  animation.start(({finished})=>{
   if(finished){elapsed.current=STORY_PLAYBACK_MS;latestNext.current();}
  });
  return()=>{elapsed.current=Math.min(STORY_PLAYBACK_MS,elapsed.current+Date.now()-started);animation.stop();};
 },[current?.id,paused,foreground,deleting,progress,readyStoryId]);
 useEffect(()=>{
  if(!current||current.expiresAt<=Date.now()){onClose();return;}
  const future=stories.slice(position+1,position+3);
  for(const photo of future)void Image.prefetch(photo.photoUrl).catch(()=>{});
 },[current?.id,position,stories,onClose]);
 const previous=()=>{if(position>0)setPosition(v=>v-1);};
 const remove=async()=>{
  if(!current||deleting)return;
  setDeleting(true);
  try{
   if(await onDelete(current.id)){
    if(stories.length===1){onClose();return;}
    setPosition(v=>Math.min(v,stories.length-2));
   }
  }finally{setDeleting(false);}
 };
 return <Modal visible={!!current} animationType="fade" onRequestClose={onClose}
  transparent statusBarTranslucent>
  <View style={s.screen}>
   {!!current&&<View style={s.frame}>
    <NativeStoryPhoto key={current.id} uri={current.photoUrl} onError={photoFailed}
     onReady={photoReady}/>
    <View pointerEvents="none" style={s.topShade}/>
    <View style={s.progressRow} accessibilityLabel={'Estado '+(position+1)+' de '+stories.length}>
     {stories.map((story,i)=><Pressable key={story.id} accessibilityRole="button"
      accessibilityLabel={'Ver foto '+(i+1)+' de '+stories.length}
      onPress={()=>setPosition(i)} style={s.progressTouch}>
      <View style={s.progressTrack}>
       {i<position?<View style={s.complete}/>:
        i===position?<Animated.View style={[s.complete,{
         transform:[{scaleX:progress}],transformOrigin:'left center'
        }]}/>:null}
      </View>
     </Pressable>)}
    </View>
    <View style={s.toolbar}>
     <View>
      <Text style={s.name}>{current.name}</Text>
      <Text style={s.info}>Estado · {position+1} de {stories.length}</Text>
     </View>
     <View style={s.toolbarActions}>
      {current.actorId===actorId&&<Pressable accessibilityRole="button"
       accessibilityLabel="Eliminar mi estado" onPress={()=>void remove()} disabled={deleting}>
       <Text style={s.remove}>Eliminar</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar estado"
       onPress={onClose}><Text style={s.close}>×</Text></Pressable>
     </View>
    </View>
    <View style={s.tapZones} pointerEvents="box-none">
     <Pressable accessibilityRole="button" accessibilityLabel="Foto anterior"
      disabled={position===0} onPress={previous} style={s.tapZone}>
      <Text style={s.tapArrow}>‹</Text>
     </Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel="Foto siguiente"
      onPress={goNext} style={[s.tapZone,s.tapRight]}>
      <Text style={s.tapArrow}>›</Text>
     </Pressable>
    </View>
    <NativeStoryConversation key={current.id} token={token} storyId={current.id} actorId={actorId} ownerId={current.actorId}
     version={version} onPause={setPaused} onBurst={setBurst}/>
    <NativeStoryReactionShower burst={burst}/>
   </View>}
  </View>
 </Modal>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#080f0a',
  paddingTop:Platform.OS==='android'?(StatusBar.currentHeight||24)+6:0,
  paddingBottom:Platform.OS==='android'?48:0},
 frame:{flex:1,position:'relative',overflow:'hidden',backgroundColor:'#0b100d'},
 topShade:{position:'absolute',top:0,left:0,right:0,height:115,
  backgroundColor:'rgba(0,0,0,.65)',zIndex:5},
 progressRow:{position:'absolute',left:12,right:12,top:2,height:23,
  flexDirection:'row',gap:4,zIndex:12},
 progressTouch:{flex:1,height:23,justifyContent:'center'},
 progressTrack:{flex:1,height:4,borderRadius:3,backgroundColor:'#ffffff66',overflow:'hidden'},
 complete:{width:'100%',height:4,backgroundColor:'#fff',borderRadius:3},
 toolbar:{position:'absolute',top:23,left:16,right:13,zIndex:11,
  flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 name:{fontWeight:'800',fontSize:16,color:'#fff'},
 info:{fontSize:11,color:'#ddd',marginTop:3},
 toolbarActions:{flexDirection:'row',alignItems:'center',gap:18},
 remove:{fontSize:12,color:'#fff'},
 close:{fontSize:30,color:'#fff',lineHeight:37,minWidth:40,textAlign:'center'},
 tapZones:{position:'absolute',top:'21%',bottom:158,left:0,right:0,zIndex:7,
  flexDirection:'row',justifyContent:'space-between'},
 tapZone:{width:'34%',height:'100%',justifyContent:'center',paddingHorizontal:12},
 tapRight:{alignItems:'flex-end'},
 tapArrow:{fontSize:31,color:'rgba(255,255,255,.68)',fontWeight:'300',
  textShadowColor:'rgba(0,0,0,.35)',textShadowRadius:8},
});
