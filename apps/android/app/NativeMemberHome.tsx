import React,{useState} from 'react';
import {ActivityIndicator,Image,Modal,Platform,Pressable,ScrollView,StatusBar,StyleSheet,Text,View} from 'react-native';
import {MEMBER_MODULES,type MemberScreen} from '@havana/shared';
import {NativeHeaderLight} from '../features/shared/NativeEmeraldMotion';
import NativeCalendar from '../features/calendar/NativeCalendar';
import NativeRepertoire from '../features/repertoire/NativeRepertoire';
import NativeMusicians from '../features/musicians/NativeMusicians';
import NativeFamily from '../features/family/NativeFamily';
import {useNativeMemberProfile} from '../features/profile/useNativeMemberProfile';
import NativeStories from '../features/stories/NativeStories';
import NativeNotices from '../features/notices/NativeNotices';
import type {CalendarEvent,RepertoireSong} from '@havana/shared';
import type {NativeModuleList} from '../features/shared/native-module-list';
import type {NativePushControl} from '../features/notices/useNativePush';
import {useNativeUnreadNotices} from '../features/notices/useNativeUnreadNotices';
import NativeAudioEditorialView from '../features/audio/NativeAudioEditorialView';

type Props={displayName:string;actorId:string;token:string;push:NativePushControl;
 active:Exclude<MemberScreen,'chat'>;calendarRevision?:number;lists:{calendar:NativeModuleList<CalendarEvent[]>;repertoire:NativeModuleList<RepertoireSong[]>};onNavigate:(screen:MemberScreen)=>void;};
// Native navigation and independent native modules; Chat session never moves here.
// Tiny embedded alpha gradient keeps the pinned Stories edge soft without a network asset.
const STORIES_FADE='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAwCAYAAADQMxCBAAAAOUlEQVR42n2JyQ0AIAzDrO4/MC1H+IEqUT6WnSBJBjQD/OCfbkB8t6gyDOhV9keOfIxsFzPbxTrQBqWZMlwxZHeoAAAAAElFTkSuQmCC';
function NativeMemberHome({displayName,actorId,token,active,calendarRevision=0,lists,onNavigate,push}:Props){
 const profile=useNativeMemberProfile(token,actorId,true);
 const unreadNotices=useNativeUnreadNotices(token,profile.liveVersion+calendarRevision);
 const [profileOpen,setProfileOpen]=useState(false);
 const isHome=active==='home';
 const selected=MEMBER_MODULES.find(item=>item.id===active);
 const mustAdd=profile.phase==='missing',checking=profile.phase==='checking';
 const avatar=(photo:string|null|undefined,name:string,size:number)=>
  photo?<Image source={{uri:photo}} style={{width:size,height:size,borderRadius:size/2}}/>:
   <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>;
 const header=<>
  <View style={styles.top}>
   <NativeHeaderLight/>
   <View style={styles.headerIdentity}>
    <Text style={styles.brand}>HAVANA NICE</Text>
    <Text style={styles.subheading}>ESPACIO DEL EQUIPO</Text>
   </View>
   <Pressable accessibilityRole="button" accessibilityLabel="Abrir mi perfil"
    onPress={()=>setProfileOpen(true)}
    disabled={profile.phase==='legacy'||profile.phase==='offline'||checking} style={styles.myProfile}>
    <View style={styles.headerAvatar}>{avatar(profile.own?.photoUrl,displayName,34)}</View>
    <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
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
   {active!=='audio'&&<Text accessibilityRole="header" style={[styles.moduleTitle,active==='family'&&styles.familyTitle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
    {active==='family'?'Familia HAVANA NICE':active==='calendar'?'Calendario':selected?.label||'Módulo'}
   </Text>}
   {active!=='calendar'&&active!=='repertoire'&&active!=='family'&&active!=='audio'&&<Text style={styles.lead}>{selected?.description}</Text>}
   {active==='repertoire'&&<Pressable accessibilityRole="button" accessibilityLabel="Abrir Audio HAVANA NICE"
     onPress={()=>onNavigate('audio')} style={styles.openAudio}>
     <Text style={styles.openAudioLabel}>♫  Abrir Audio HAVANA NICE</Text>
   </Pressable>}
   {active==='calendar'?<NativeCalendar token={token} calendarRevision={calendarRevision} list={lists.calendar}/>:
    active==='repertoire'?<NativeRepertoire token={token} calendarRevision={calendarRevision} list={lists.repertoire}/>:
    active==='musicians'?<NativeMusicians token={token}/>:
    active==='family'?<NativeFamily token={token} onBackHome={()=>onNavigate('home')}/>:
    active==='notices'?<NativeNotices token={token} calendarRevision={calendarRevision} push={push}/>:
    active==='audio'?null:<View style={styles.pending}>
     <Text style={styles.pendingTitle}>Módulo en preparación</Text>
     <Text style={styles.pendingDescription}>Esta sección estará disponible próximamente.</Text>
    </View>}
  </>}
 </>;
 return <View style={[styles.screen,!isHome&&styles.internalScreen]}>
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
 screen:{flex:1,backgroundColor:'#f7f0e8'},internalScreen:{backgroundColor:'#F7F4ED'},root:{flex:1,minHeight:0},
 storiesFixed:{backgroundColor:'#fff',paddingHorizontal:20,paddingBottom:0,zIndex:3},
 hiddenStories:{display:'none'},
  storiesFade:{position:'absolute',left:0,right:0,bottom:-29,height:36,zIndex:4},
 loungeInline:{marginHorizontal:-20,marginTop:0,backgroundColor:'#f7f0e8'},
 content:{paddingHorizontal:20,paddingTop:0,paddingBottom:24,flexGrow:1},
 familyViewport:{flex:1,minHeight:0,paddingBottom:0},
 top:{backgroundColor:'#0D2A23',paddingHorizontal:20,paddingBottom:17,
  paddingTop:Platform.OS==='android'?(StatusBar.currentHeight||24)+20:20,
  minHeight:90,marginHorizontal:0,marginTop:0,
  marginBottom:0,flexDirection:'row',justifyContent:'space-between',alignItems:'center',
  position:'relative',overflow:'hidden'},
 headerIdentity:{zIndex:1,flex:1,minWidth:0},
 moduleTitle:{fontSize:43,fontWeight:'700',letterSpacing:-2.2,color:'#103c2f',marginTop:15,marginBottom:20},
 familyTitle:{fontSize:34,lineHeight:37,letterSpacing:-1.5},
 brand:{fontFamily:'serif',fontSize:17,fontWeight:'700',letterSpacing:2.7,color:'#DBC59A'},
 subheading:{fontSize:10,letterSpacing:1.6,color:'#D3DED5',marginTop:8},
 myProfile:{padding:2,zIndex:1,flexDirection:'row',alignItems:'center',gap:7,maxWidth:'34%'},profileName:{fontSize:11,color:'#f5f1e8',fontWeight:'600',flexShrink:1},headerAvatar:{width:38,height:38,borderRadius:19,
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
