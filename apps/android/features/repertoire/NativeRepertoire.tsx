import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Easing,LayoutAnimation,Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {watchNativeRepertoire} from '../../services/native-calendar-live';
import {getRepertoireSongs,repertoireSection,REPERTOIRE_SECTIONS,safeRepertoireLink,
 type RepertoireSection,type RepertoireSong} from '@havana/shared';

export default function NativeRepertoire({token}:{token:string}){
 const [songs,setSongs]=useState<RepertoireSong[]>([]);
 const [open,setOpen]=useState<RepertoireSection|null>('ENGLISH');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const requestId=useRef(0);
 const ambient=useRef(new Animated.Value(0)).current;
 const reveal=useRef(new Animated.Value(0)).current;
 const [reduceMotion,setReduceMotion]=useState(false);
 useEffect(()=>{
  let active=true;
  void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduceMotion(value);}).catch(()=>{});
  const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);
  return()=>{active=false;subscription.remove();};
 },[]);
 useEffect(()=>{
  if(reduceMotion){ambient.stopAnimation();ambient.setValue(0);return;}
  const loop=Animated.loop(Animated.sequence([
   Animated.timing(ambient,{toValue:1,duration:6700,easing:Easing.inOut(Easing.sin),useNativeDriver:true}),
   Animated.timing(ambient,{toValue:0,duration:6700,easing:Easing.inOut(Easing.sin),useNativeDriver:true}),
  ]));
  loop.start();
  return()=>loop.stop();
 },[ambient,reduceMotion]);
 useEffect(()=>{
  reveal.stopAnimation();
  if(reduceMotion||!open){reveal.setValue(open?1:0);return;}
  reveal.setValue(0);
  const animation=Animated.timing(reveal,{toValue:1,duration:460,easing:Easing.out(Easing.cubic),useNativeDriver:true});
  animation.start();
  return()=>animation.stop();
 },[open,reduceMotion,reveal]);
 const refresh=useCallback(async()=>{
  const id=++requestId.current;
  try{const next=await getRepertoireSongs(token);
   if(id!==requestId.current)return;setSongs(next);setError('');
  }catch(e){if(id===requestId.current)setError(e instanceof Error?e.message:'No se pudo cargar Repertorio.');}
  finally{if(id===requestId.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setSongs([]);setOpen('ENGLISH');setLoading(true);setError('');
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
 const tintOpacity=ambient.interpolate({inputRange:[0,1],outputRange:[0.05,0.26]});
 const glintOpacity=ambient.interpolate({inputRange:[0,0.22,0.38,0.72,1],outputRange:[0,0.04,0.15,0.03,0]});
 const glintTravel=ambient.interpolate({inputRange:[0,1],outputRange:[-135,155]});
 const panelOpacity=ambient.interpolate({inputRange:[0,1],outputRange:[0.08,0.3]});
 return <View style={styles.root}>
  <View style={styles.toolbar}><Text style={styles.section}>Repertorio general</Text>
   <Pressable accessibilityRole="button" onPress={()=>void refresh()}><Text style={styles.action}>Actualizar</Text></Pressable>
  </View>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  <View style={styles.panel}>
   <View style={styles.tabs}>{REPERTOIRE_SECTIONS.map(section=><Pressable key={section}
    accessibilityRole="button" accessibilityLabel={'Mostrar '+section}
    accessibilityState={{expanded:open===section}}
    onPress={()=>changeSection(section)}
    style={[styles.tab,open===section&&styles.selectedTab]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject,
     styles.tabTint,{opacity:tintOpacity}]}/>
    <Animated.View pointerEvents="none" style={[styles.tabGlint,
     {opacity:glintOpacity,transform:[{translateX:glintTravel},{rotate:'18deg'}]}]}/>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.73}
     style={[styles.tabText,open===section&&styles.selectedTabText]}>{section}</Text>
    <Text style={[styles.tabPlus,open===section&&styles.selectedTabText]}>{open===section?'−':'+'}</Text>
   </Pressable>)}</View>
   {!!open&&<Animated.View style={[styles.reveal,{
    opacity:reveal,transform:[{translateY:reveal.interpolate({inputRange:[0,1],outputRange:[-12,0]})},
     {scaleY:reveal.interpolate({inputRange:[0,1],outputRange:[0.97,1]})}]
   }]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFillObject,
     styles.panelTint,{opacity:panelOpacity}]}/>
    <View style={styles.greenRule}/>
    {loading?<Text style={styles.empty}>Cargando canciones…</Text>:
     !visible.length?<Text style={styles.empty}>No hay canciones en {open.toLowerCase()}.</Text>:
     visible.map(song=><View key={song.id} style={styles.song}>
      <View style={styles.songText}><Text style={styles.name}>{song.title}</Text>
       {!!song.artist&&<Text style={styles.artist}>{song.artist}</Text>}</View>
      {!!safeRepertoireLink(song.referenceUrl)&&<Pressable accessibilityRole="link"
       onPress={()=>link(song.referenceUrl)}><Text style={styles.action}>REVISAR LINK ↗</Text></Pressable>}
     </View>)}
   </Animated.View>}
  </View>
  <Text style={styles.hint}>El repertorio de cada evento está en Calendario, dentro de su fecha.</Text>
 </View>;
}
const styles=StyleSheet.create({
 root:{gap:13,paddingBottom:30},
 toolbar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8},
 section:{fontSize:23,color:'#153d30',fontWeight:'700'},
 action:{fontSize:10,color:'#55735a',fontWeight:'700'},
 error:{color:'#ad3434',fontSize:13},empty:{padding:17,color:'#647a6b',fontSize:12},
 panel:{marginTop:13,padding:12,paddingBottom:11,borderWidth:1,borderColor:'#e1e4dc',
  borderRadius:18,backgroundColor:'#fcfaf5',shadowColor:'#153c30',shadowOpacity:0.05,
  shadowOffset:{width:0,height:3},shadowRadius:11,elevation:1},
 tabs:{flexDirection:'row',gap:6},
 tab:{flex:1,minWidth:0,minHeight:60,paddingVertical:9,paddingHorizontal:2,
  borderRadius:13,borderWidth:1,borderColor:'#a4bba9',backgroundColor:'#d0e4d2',
  alignItems:'center',justifyContent:'center',gap:3,overflow:'hidden'},
 selectedTab:{backgroundColor:'#174a39',borderColor:'#184738'},
 tabTint:{backgroundColor:'#7bb08f'},
 tabGlint:{position:'absolute',width:26,height:110,top:-22,left:0,backgroundColor:'#ffffff'},
 tabText:{fontSize:10,fontWeight:'800',color:'#163f30',textAlign:'center'},
 selectedTabText:{color:'#fff7e7'},tabPlus:{fontSize:13,color:'#244e39'},
 reveal:{position:'relative',marginTop:11,paddingHorizontal:11,paddingVertical:5,
  borderWidth:1,borderColor:'#d5e0d3',borderRadius:14,backgroundColor:'#fbfcf8',
  overflow:'hidden',shadowColor:'#214a30',shadowOpacity:0.04,shadowOffset:{width:0,height:2},
  shadowRadius:6},
 panelTint:{backgroundColor:'#c9e5cf'},
 greenRule:{height:3,marginHorizontal:-11,marginTop:-5,marginBottom:6,backgroundColor:'#93bca0'},
 song:{flexDirection:'row',gap:10,alignItems:'center',justifyContent:'space-between',
  paddingVertical:15,borderBottomWidth:1,borderBottomColor:'#d9e2d7'},
 songText:{flex:1,gap:4},name:{fontSize:14,color:'#213d31',fontWeight:'700'},
 artist:{color:'#768579',fontSize:12},
 hint:{fontSize:12,color:'#697668',lineHeight:19,marginTop:6}
});
