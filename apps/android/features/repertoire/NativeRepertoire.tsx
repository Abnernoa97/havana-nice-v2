import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,LayoutAnimation,Linking,Platform,Pressable,StyleSheet,Text,UIManager,View} from 'react-native';
import {watchNativeRepertoire} from '../../services/native-calendar-live';
import {getRepertoireSongs,repertoireSection,REPERTOIRE_SECTIONS,safeRepertoireLink,
 type RepertoireSection,type RepertoireSong} from '@havana/shared';

export default function NativeRepertoire({token}:{token:string}){
 const [songs,setSongs]=useState<RepertoireSong[]>([]);
 const [open,setOpen]=useState<RepertoireSection|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const requestId=useRef(0);
 const shimmer=useRef(new Animated.Value(0)).current;
 const unfold=useRef(new Animated.Value(0)).current;
 const [reduceMotion,setReduceMotion]=useState(false);
 useEffect(()=>{
  if(Platform.OS==='android')UIManager.setLayoutAnimationEnabledExperimental?.(true);
  let alive=true;
  void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduceMotion(v);}).catch(()=>{});
  const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);
  return()=>{alive=false;subscription.remove();};
 },[]);
 useEffect(()=>{
  if(reduceMotion){shimmer.stopAnimation();shimmer.setValue(0);return;}
  const loop=Animated.loop(Animated.timing(shimmer,{
   toValue:1,duration:4700,easing:Easing.linear,useNativeDriver:true
  }));
  loop.start();
  return()=>loop.stop();
 },[shimmer,reduceMotion]);
 useEffect(()=>{
  unfold.stopAnimation();
  if(!open||reduceMotion){unfold.setValue(open?1:0);return;}
  unfold.setValue(0);
  const anim=Animated.timing(unfold,{
   toValue:1,duration:690,easing:Easing.out(Easing.cubic),useNativeDriver:true
  });
  anim.start();
  return()=>anim.stop();
 },[open,reduceMotion,unfold]);
 const refresh=useCallback(async()=>{
  const id=++requestId.current;
  try{const next=await getRepertoireSongs(token);
   if(id!==requestId.current)return;
   setSongs(next);setError('');
  }catch(e){if(id===requestId.current)setError(e instanceof Error?e.message:'No se pudo cargar Repertorio.');}
  finally{if(id===requestId.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setSongs([]);setOpen(null);setLoading(true);setError('');
  const stop=watchNativeRepertoire(token,()=>void refresh());
  return()=>{++requestId.current;stop();};
 },[token,refresh]);
 const visible=open?songs.filter(song=>repertoireSection(song.category)===open):[];
 const link=(value:string)=>{
  const url=safeRepertoireLink(value);
  if(url)void Linking.openURL(url).catch(()=>setError('No se pudo abrir el enlace.'));
 };
 const changeSection=(section:RepertoireSection)=>{
  if(!reduceMotion)LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setOpen(v=>v===section?null:section);
 };
 const tintOpacity=shimmer.interpolate({inputRange:[0,.4,.8,1],outputRange:[.12,.34,.19,.12]});
 const glintOpacity=shimmer.interpolate({inputRange:[0,.1,.55,.75,1],outputRange:[.66,.85,.7,.2,0]});
 const glintTravel=shimmer.interpolate({inputRange:[0,1],outputRange:[-12,180]});
 const waveTravel=shimmer.interpolate({inputRange:[0,.5,1],outputRange:[-31,22,-31]});
 const waveReverse=shimmer.interpolate({inputRange:[0,.5,1],outputRange:[23,-24,23]});
 const waveSheenTravel=shimmer.interpolate({inputRange:[0,1],outputRange:[-80,420]});
 const panelOpacity=shimmer.interpolate({inputRange:[0,.5,1],outputRange:[.12,.28,.12]});
 return <View style={styles.root}>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  <View style={styles.tabs}>
   {REPERTOIRE_SECTIONS.map(section=><Pressable key={section}
    accessibilityRole="button" accessibilityLabel={'Mostrar '+section}
    accessibilityState={{expanded:open===section}}
    onPress={()=>changeSection(section)}
    style={[styles.tab,open===section&&styles.selectedTab]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,
     styles.tabTint,{opacity:tintOpacity}]}/>
    {!reduceMotion&&<Animated.View pointerEvents="none" style={[styles.tabGlint,{
     opacity:glintOpacity,transform:[{translateX:glintTravel},{rotate:'15deg'}]}]}/>}
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}
     style={[styles.tabText,open===section&&styles.selectedTabText]}>{section}</Text>
   </Pressable>)}
  </View>
  {!!open&&<Animated.View style={[styles.reveal,{
   opacity:unfold,transform:[{translateY:unfold.interpolate({inputRange:[0,1],outputRange:[-15,0]})},
    {scaleY:unfold.interpolate({inputRange:[0,1],outputRange:[.93,1]})}]
  }]}>
   <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill,styles.panelTint,{opacity:panelOpacity}]}/>
   <View pointerEvents="none" style={styles.waveClip}>
    <Animated.View style={[styles.waveOne,{transform:[{translateX:waveTravel}]}]}/>
    <Animated.View style={[styles.waveTwo,{transform:[{translateX:waveReverse}]}]}/>
    {!reduceMotion&&<Animated.View style={[styles.waveSheen,{opacity:glintOpacity,
     transform:[{translateX:waveSheenTravel},{rotate:'-9deg'}]}]}/>}
   </View>
   <View style={styles.songList}>
    {loading?<Text style={styles.empty}>Cargando canciones…</Text>:
     !visible.length?<Text style={styles.empty}>No hay canciones en {open.toLowerCase()}.</Text>:
     visible.map(song=><View key={song.id} style={styles.song}>
      <View style={styles.songText}><Text style={styles.name}>{song.title}</Text>
       {!!song.artist&&<Text style={styles.artist}>{song.artist}</Text>}</View>
      {!!safeRepertoireLink(song.referenceUrl)&&<Pressable accessibilityRole="link"
       onPress={()=>link(song.referenceUrl)}><Text style={styles.action}>REVISAR LINK ↗</Text></Pressable>}
     </View>)}
   </View>
  </Animated.View>}
 </View>;
}
const styles=StyleSheet.create({
 root:{gap:12,paddingBottom:28},
 error:{color:'#ad3434',fontSize:13},
 action:{fontSize:11,color:'#174e38',fontWeight:'700',textDecorationLine:'underline'},
 empty:{paddingVertical:21,color:'#647a6b',fontSize:13},
 tabs:{flexDirection:'row',gap:6,marginTop:0,marginBottom:2},
 tab:{flex:1,minWidth:0,minHeight:64,paddingVertical:12,paddingHorizontal:3,
  borderRadius:18,borderWidth:1,borderColor:'#adcdb8',backgroundColor:'#c5dfcb',
  alignItems:'center',justifyContent:'center',overflow:'hidden',
  shadowColor:'#1a4a30',shadowOpacity:.1,shadowRadius:8,elevation:2},
 selectedTab:{backgroundColor:'#0b432f',borderColor:'#155e43'},
 tabTint:{backgroundColor:'#87bca0'},
 tabGlint:{position:'absolute',width:35,height:116,top:-25,left:0,backgroundColor:'#ffffff',borderRadius:10},
 tabText:{fontSize:11,fontWeight:'800',color:'#123b2d',textAlign:'center'},
 selectedTabText:{color:'#fffdf5'},
 reveal:{position:'relative',marginTop:2,borderTopLeftRadius:36,borderTopRightRadius:42,
  borderBottomLeftRadius:32,borderBottomRightRadius:45,backgroundColor:'#fffdfa',
  borderWidth:1,borderColor:'#e1e8dc',overflow:'hidden',
  shadowColor:'#14412c',shadowOpacity:.11,shadowRadius:13,shadowOffset:{width:0,height:7},elevation:2},
 panelTint:{backgroundColor:'#d0e8d4'},
 waveClip:{height:58,overflow:'hidden',backgroundColor:'#e9f5ea'},
 waveOne:{position:'absolute',width:'143%',height:93,left:'-22%',top:13,
  borderTopLeftRadius:140,borderTopRightRadius:120,
  backgroundColor:'#84ba95',opacity:.42,transform:[{rotate:'-4deg'}]},
 waveTwo:{position:'absolute',width:'140%',height:75,left:'-19%',top:25,
  borderTopLeftRadius:120,borderTopRightRadius:140,
  backgroundColor:'#f4fcf4',opacity:.78,transform:[{rotate:'4deg'}]},
 waveSheen:{position:'absolute',width:125,height:11,top:22,left:-24,
  borderRadius:15,backgroundColor:'#fffef2'},
 songList:{paddingHorizontal:16,paddingTop:6,paddingBottom:10},
 song:{flexDirection:'row',gap:10,alignItems:'center',justifyContent:'space-between',
  paddingVertical:17,borderBottomWidth:1,borderBottomColor:'#d9e2d7'},
 songText:{flex:1,gap:5},name:{fontSize:15,color:'#153a2c',fontWeight:'700'},
 artist:{color:'#768579',fontSize:12}
});
