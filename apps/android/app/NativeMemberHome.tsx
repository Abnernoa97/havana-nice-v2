import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,ActivityIndicator,Animated,Easing,Image,Modal,Platform,Pressable,ScrollView,StatusBar,StyleSheet,Text,useWindowDimensions,View} from 'react-native';
import {MEMBER_MODULES,type MemberScreen} from '@havana/shared';
import NativeCalendar from '../features/calendar/NativeCalendar';
import NativeRepertoire from '../features/repertoire/NativeRepertoire';
import NativeMusicians from '../features/musicians/NativeMusicians';
import NativeFamily from '../features/family/NativeFamily';
import {useNativeMemberProfile} from '../features/profile/useNativeMemberProfile';
import NativeStories from '../features/stories/NativeStories';
import NativeNotices from '../features/notices/NativeNotices';
import type {NativePushControl} from '../features/notices/useNativePush';
import {useNativeUnreadNotices} from '../features/notices/useNativeUnreadNotices';
import NativeAudioEditorialView from '../features/audio/NativeAudioEditorialView';

type Props={displayName:string;actorId:string;token:string;push:NativePushControl;
 active:Exclude<MemberScreen,'chat'>;calendarRevision?:number;onNavigate:(screen:MemberScreen)=>void;};
// Native navigation and independent native modules; Chat session never moves here.
// Tiny embedded alpha gradient keeps the pinned Stories edge soft without a network asset.
const STORIES_FADE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAwCAYAAADQMxCBAAAAOUlEQVR42n2JyQ0AIAzDrO4/MC1H+IEqUT6WnSBJBjQD/OCfbkB8t6gyDOhV9keOfIxsFzPbxTrQBqWZMlwxZHeoAAAAAElFTkSuQmCC';
// Tiny locally embedded gradient textures. Unlike flat shapes these have
// transparent feathered edges, like the PWA's radial bloom and light streak.
// No browser container, new dependency, remote image or per-frame JS rendering.
const HEADER_GRADIENT='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAAAgCAYAAACFM/9sAAAA90lEQVR42u3ZQQ6CMBAF0PpTU1IXnMEDeP9zsbCBYKIro5iSWKctDv2zKwHSvv4JBA7d5Xw3CWV9Z1quWxgXYxiWqAhIQAISkIAsAtaqz9c4Av6I+IS0mibuer8YT0PYHlIjXOz4VphWK96/pBN7wFu7VnK96gTmXHjpNsee8WqkEq3glYJEa3i5IdEqXi5ItI4nhQTxZPMC8WRp5McE4UaD6ZPNF8STtXQSYOv/hGMBANMnW4fVhnc8vbpgvo6bY1pN7fuOFxvXhHW9N9MQ6iQwR/rWsL45txSo672OT/opeLXbHlraN+dmSDek6lNY2r45F1vivg94RCXHSidV9QAAAABJRU5ErkJggg==';
const HEADER_BLOOM='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAgCAYAAABU1PscAAAA30lEQVR42u2XOwrDMAyG01J6iQ7Gk+7Ru/QqvaMmoyH36NLJBEWOHolBggwJtvJ/6GXf3t/Pc5nY7svklgAJkACT28PQFwyux6sAgHIfngUAxpHDSABOfN3Z2xifGFHEwAivgv3cOvAGgEFB5f+MgIBXCkkdl51vJPwXeqUQl+/lAGDVCLCcA729uvc1J3FwBNYIAG0E+p4uKVASzgXzCKCwE9FGwdKgLvRKoS2IxnQTOjCR0TuFkBHUhGlnIl5TxFw6NYXP0C6ERqfS047TWpDLXGhMBeWlPgESIAHmsh9NrSXTABca1QAAAABJRU5ErkJggg==';
const HEADER_STREAK='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAAAQCAYAAACBSfjBAAABIElEQVR42u1YzY6CMBD+WvAvGs2a9eRRfBYf1vgAPgvqbU+7cbNGRBCmHkwToljQWCtu59TMwPSbb35KYVN/Biv3i2ti00lv0NLhd/73Hb40geNmuzDwT7fOz3VdxyUTidmkyQWWnyQuxOLvg/BhBJYh7d0kG3MRmdxOserNwJFm/8sqE+gBiHL0dUMJinPsDQALEwR61wxt7gzlmiC6cl1jvAMAiRB9leMG5x/3gI+IflV2h7E1ABwEbTNYNwCGABBQ+qV4vRTJdgY+sQKvZiSgVNq8FndWUp8KcdqEM2ULy+duBs+Y0r4jEZ+qhGWxGmvhsiTnVTUZOkSKsFTyFF6+UwvbGai7ArNf4v/lVvLQq9ytjn0E9meCbjERqC45AgteXIGotz/kAAAAAElFTkSuQmCC';
function NativeMemberHome({displayName,actorId,token,active,calendarRevision=0,onNavigate,push}:Props){
 const profile=useNativeMemberProfile(token,actorId,true);
 const unreadNotices=useNativeUnreadNotices(token,profile.liveVersion+calendarRevision);
 const [profileOpen,setProfileOpen]=useState(false);
 const {width:screenWidth}=useWindowDimensions();
 const isHome=active==='home';
 const headerPhase=useRef(new Animated.Value(0)).current;
 const bloomPhase=useRef(new Animated.Value(0)).current;
 const [reduceHeaderMotion,setReduceHeaderMotion]=useState(false);
 useEffect(()=>{
  let alive=true;
  void AccessibilityInfo.isReduceMotionEnabled().then(v=>{if(alive)setReduceHeaderMotion(v);}).catch(()=>{});
  const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceHeaderMotion);
  return()=>{alive=false;listener.remove();};
 },[]);
 useEffect(()=>{
  headerPhase.setValue(0);bloomPhase.setValue(0);
  if(!isHome||reduceHeaderMotion)return;
  const streak=Animated.loop(Animated.timing(headerPhase,{
   toValue:1,duration:4600,easing:Easing.linear,useNativeDriver:true,isInteraction:false
  }));
  const bloom=Animated.loop(Animated.sequence([
   Animated.timing(bloomPhase,{toValue:1,duration:2650,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
   Animated.timing(bloomPhase,{toValue:0,duration:2650,easing:Easing.inOut(Easing.sin),useNativeDriver:true,isInteraction:false}),
  ]));
  streak.start();bloom.start();
  return()=>{streak.stop();bloom.stop();};
 },[headerPhase,bloomPhase,reduceHeaderMotion,isHome]);
 const headerShineTravel=headerPhase.interpolate({inputRange:[0,.75,1],outputRange:[0,screenWidth*1.225,screenWidth*1.225]});
 const headerShineOpacity=headerPhase.interpolate({inputRange:[0,.75,.85,1],outputRange:[.92,.78,0,0]});
 const headerBloomTravel=bloomPhase.interpolate({inputRange:[0,1],outputRange:[-screenWidth*.094,screenWidth*.975]});
 const headerBloomOpacity=bloomPhase.interpolate({inputRange:[0,1],outputRange:[.42,.9]});
 const selected=MEMBER_MODULES.find(item=>item.id===active);
 const mustAdd=profile.phase==='missing',checking=profile.phase==='checking';
 const avatar=(photo:string|null|undefined,name:string,size:number)=>
  photo?<Image source={{uri:photo}} style={{width:size,height:size,borderRadius:size/2}}/>:
   <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>;
 const header=<>
  <View style={[styles.top,!isHome&&styles.compactTop]}>
   {isHome&&<>
    <Image pointerEvents="none" source={{uri:HEADER_GRADIENT}} resizeMode="stretch" style={styles.headerGradient}/>
    {!reduceHeaderMotion&&<>
     <Animated.Image pointerEvents="none" source={{uri:HEADER_BLOOM}} resizeMode="stretch" style={[styles.headerBloom,{
      width:screenWidth*.78,opacity:headerBloomOpacity,transform:[{translateX:headerBloomTravel},{rotate:'-13deg'}]}]}/>
     <Animated.Image pointerEvents="none" source={{uri:HEADER_STREAK}} resizeMode="stretch" style={[styles.headerShine,{
      width:screenWidth*.5,opacity:headerShineOpacity,transform:[{translateX:headerShineTravel},{rotate:'-12deg'}]}]}/>
    </>}
   </>}
   <View style={styles.headerIdentity}>
    {isHome?<><Text style={styles.brand}>HAVANA NICE</Text>
     <Text style={styles.subheading}>ESPACIO DEL EQUIPO</Text></>:
     <Text accessibilityRole="header" numberOfLines={1} style={styles.moduleTitle}>
      {active==='family'?'Familia HAVANA NICE':active==='calendar'?'Calendario':selected?.label||'Módulo'}
     </Text>}
   </View>
   <Pressable accessibilityRole="button" accessibilityLabel="Abrir mi perfil"
    onPress={()=>setProfileOpen(true)}
    disabled={profile.phase==='legacy'||profile.phase==='offline'||checking} style={styles.myProfile}>
    <View style={[styles.headerAvatar,!isHome&&styles.compactAvatar]}>{avatar(profile.own?.photoUrl,displayName,isHome?36:28)}</View>
   </Pressable>
  </View>
 </>;
 const content=<>
  {active==='home'?<View style={styles.loungeInline}
   accessibilityLabel="Private Listening Lounge">
    <NativeAudioEditorialView inline/>
  </View>:<>
   {active!=='calendar'&&active!=='repertoire'&&active!=='family'&&<Pressable accessibilityRole="button" accessibilityLabel="Volver a Inicio"
    style={styles.back} onPress={()=>onNavigate('home')}><Text style={styles.backLabel}>‹ Inicio</Text></Pressable>}
   {active!=='calendar'&&active!=='repertoire'&&active!=='family'&&<Text style={styles.lead}>{selected?.description}</Text>}
   {active==='repertoire'&&<Pressable accessibilityRole="button" accessibilityLabel="Abrir Audio HAVANA NICE"
     onPress={()=>onNavigate('audio')} style={styles.openAudio}>
     <Text style={styles.openAudioLabel}>♫  Abrir Audio HAVANA NICE</Text>
   </Pressable>}
   {active==='calendar'?<NativeCalendar token={token} calendarRevision={calendarRevision}/>:
    active==='repertoire'?<NativeRepertoire token={token}/>:
    active==='musicians'?<NativeMusicians token={token}/>:
    active==='family'?<NativeFamily token={token} onBackHome={()=>onNavigate('home')}/>:
    active==='notices'?<NativeNotices token={token} calendarRevision={calendarRevision} push={push}/>:
    active==='audio'?null:<View style={styles.pending}>
     <Text style={styles.pendingTitle}>Módulo en preparación</Text>
     <Text style={styles.pendingDescription}>Esta sección estará disponible próximamente.</Text>
    </View>}
  </>}
 </>;
 return <View style={styles.screen}>
  {header}
  {/* Keep the same authorized story cache and grant state when changing
      modules, but remove the entire strip from layout and accessibility. */}
  <View style={[styles.storiesFixed,!isHome&&styles.hiddenStories]}
   importantForAccessibility={isHome?'auto':'no-hide-descendants'}
   accessibilityElementsHidden={!isHome}>
   <NativeStories token={token} actorId={actorId}
    displayName={displayName} profiles={profile.profiles}
    canPublish={profile.phase==='ready'} refreshVersion={profile.liveVersion}/>
   <Image pointerEvents="none" source={{uri:STORIES_FADE}}
    resizeMode="stretch" style={styles.storiesFade}/>
  </View>
  {active==='family'?<View style={[styles.root,styles.content,styles.familyViewport]}>{content}</View>:
   <ScrollView style={styles.root} contentContainerStyle={styles.content}
    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{content}</ScrollView>}
  <View style={styles.bottomNav} accessibilityRole="tablist">
   {(['home','chat','calendar','repertoire','family','notices'] as MemberScreen[]).map(dest=>{
    const item=MEMBER_MODULES.find(m=>m.id===dest),isActive=active===dest;
    const label=dest==='home'?'Inicio':dest==='family'?'Familia':item?.label||dest;
    return <Pressable key={dest} accessibilityRole="tab" accessibilityState={{selected:isActive}}
      accessibilityLabel={label} style={[styles.bottomTab,isActive&&styles.activeTab]}
      onPress={()=>onNavigate(dest)}>
      <Text style={[styles.bottomGlyph,isActive&&styles.activeLabel]}>{dest==='home'?'⌂':item?.glyph||'•'}</Text>
      <Text numberOfLines={1} style={[styles.bottomLabel,isActive&&styles.activeLabel]}>{label}</Text>
      {dest==='notices'&&unreadNotices>0&&<View style={styles.unreadBadge}><Text style={styles.unreadCount}>{unreadNotices}</Text></View>}
     </Pressable>;
   })}
  </View>
  <Modal visible={checking||mustAdd||profileOpen} transparent animationType="fade"
   onRequestClose={()=>{if(!mustAdd&&!checking)setProfileOpen(false);}}>
   <View style={styles.overlay}>
    <View style={styles.profileCard}>
     {checking?<ActivityIndicator size="large" color="#153d31"/>:<>
      {!mustAdd&&<Pressable onPress={()=>setProfileOpen(false)} accessibilityLabel="Cerrar perfil"
       style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>}
      <View style={styles.bigAvatar}>{avatar(profile.own?.photoUrl,displayName,104)}</View>
      <Text style={styles.profileTitle}>{mustAdd?'Tu foto de perfil':'Mi perfil'}</Text>
      <Text style={styles.profileHint}>{mustAdd?'Hola, '+displayName+'. Agrega tu foto para comenzar.':
       'Tu fotografía es visible para todo el equipo.'}</Text>
      <Pressable accessibilityRole="button" style={styles.choosePhoto}
       disabled={profile.saving} onPress={()=>void profile.choosePhoto()}>
       <Text style={styles.choosePhotoLabel}>{profile.saving?'Guardando fotografía…':
        mustAdd?'Agregar mi foto':'Cambiar fotografía'}</Text>
      </Pressable>
      {!!profile.error&&<Text style={styles.profileError}>{profile.error}</Text>}
      {!mustAdd&&<Text style={styles.settings}>Ajustes del perfil · Próximamente</Text>}
     </>}
    </View>
   </View>
  </Modal>
 </View>;
}
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#f7f0e8'},root:{flex:1,minHeight:0},
 storiesFixed:{backgroundColor:'#fff',paddingHorizontal:20,paddingBottom:0,zIndex:3},
 hiddenStories:{display:'none'},
  storiesFade:{position:'absolute',left:0,right:0,bottom:-29,height:36,zIndex:4},
 loungeInline:{marginHorizontal:-20,marginTop:0,backgroundColor:'#f7f0e8'},
 content:{paddingHorizontal:20,paddingTop:0,paddingBottom:24,flexGrow:1},
 familyViewport:{flex:1,minHeight:0,paddingBottom:0},
 top:{backgroundColor:'#0D2A23',paddingHorizontal:20,paddingBottom:16,
  paddingTop:Platform.OS==='android'?(StatusBar.currentHeight||24)+12:16,
  minHeight:95,marginHorizontal:0,marginTop:0,
  marginBottom:0,flexDirection:'row',justifyContent:'space-between',alignItems:'center',
  position:'relative',overflow:'hidden'},
 compactTop:{minHeight:0,paddingTop:Platform.OS==='android'?(StatusBar.currentHeight||24)+5:8,
  paddingBottom:7,backgroundColor:'#0D2A23'},
 headerIdentity:{zIndex:1,flex:1,minWidth:0},
 headerGradient:{position:'absolute',top:0,left:0,right:0,bottom:0,width:'100%',height:'100%'},
 headerBloom:{position:'absolute',height:240,top:-65,left:'-35%'},
 headerShine:{position:'absolute',height:24,left:'-17%',top:'65%'},
 moduleTitle:{fontSize:19,fontWeight:'600',color:'#DBC59A'},
 compactAvatar:{width:32,height:32,borderRadius:16},
 brand:{fontFamily:'serif',fontSize:19,fontWeight:'700',letterSpacing:2,color:'#DBC59A'},
 subheading:{fontSize:11,letterSpacing:1.4,color:'#D3DED5',marginTop:8},
 myProfile:{padding:2,zIndex:1},headerAvatar:{width:40,height:40,borderRadius:20,
  borderWidth:2,borderColor:'#DBC59A',backgroundColor:'#f2f4ec',alignItems:'center',justifyContent:'center',overflow:'hidden'},
 initial:{fontSize:20,color:'#285343',fontWeight:'700'},
 bottomNav:{flexDirection:'row',backgroundColor:'#FFFCF7',borderTopWidth:1,borderColor:'#E4DDD1',paddingVertical:8},
 bottomTab:{flex:1,alignItems:'center',borderRadius:9,paddingVertical:6,marginHorizontal:1},
 activeTab:{backgroundColor:'#E7EEE6'},bottomGlyph:{fontSize:20,color:'#708077'},
 unreadBadge:{position:'absolute',top:0,right:5,minWidth:17,height:17,borderRadius:9,
  backgroundColor:'#98433C',alignItems:'center',justifyContent:'center',paddingHorizontal:3},
 unreadCount:{color:'#fff',fontSize:10,fontWeight:'700'},
 bottomLabel:{fontSize:9,color:'#708077'},activeLabel:{fontWeight:'800',color:'#133B30'},
 lead:{fontSize:14,lineHeight:21,color:'#657269',marginTop:8,marginBottom:23},
 openAudio:{marginBottom:26,paddingVertical:16,paddingHorizontal:16,borderWidth:1,
  borderColor:'#bbd3c2',backgroundColor:'#edf5ea',borderRadius:32,alignSelf:'stretch',alignItems:'center'},
 openAudioLabel:{color:'#164431',fontSize:13,fontWeight:'700'},
 back:{paddingVertical:8,alignSelf:'flex-start'},backLabel:{fontSize:15,color:'#133B30',fontWeight:'700'},
 pending:{marginTop:24,padding:22,backgroundColor:'#f7f7f7',borderRadius:15,minHeight:140},
 pendingTitle:{fontSize:19,color:'#1B332B',fontWeight:'700'},
 pendingDescription:{fontSize:13,color:'#657269',marginTop:10},
 overlay:{flex:1,backgroundColor:'rgba(5,20,13,.75)',justifyContent:'center',alignItems:'center',padding:20},
 profileCard:{width:'100%',maxWidth:380,borderRadius:22,padding:25,paddingVertical:34,
  alignItems:'center',backgroundColor:'#fff'},
 bigAvatar:{width:110,height:110,borderRadius:55,overflow:'hidden',
  borderWidth:3,borderColor:'#C9B07D',backgroundColor:'#f0f0ef',
  alignItems:'center',justifyContent:'center'},
 profileTitle:{fontSize:23,color:'#153d31',fontWeight:'700',marginTop:17},
 profileHint:{fontSize:14,color:'#687068',textAlign:'center',lineHeight:21,marginTop:10},
 choosePhoto:{width:'100%',backgroundColor:'#153d31',borderRadius:12,padding:15,marginTop:22},
 choosePhotoLabel:{textAlign:'center',color:'#fff',fontWeight:'700',fontSize:14},
 profileError:{color:'#9c342d',marginTop:12,textAlign:'center'},
 settings:{color:'#7b807a',fontSize:12,marginTop:25},
 close:{position:'absolute',top:12,right:19},closeText:{fontSize:29,color:'#343f38'}
});
export default React.memo(NativeMemberHome);
