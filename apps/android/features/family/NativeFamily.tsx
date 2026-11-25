import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {ActivityIndicator,BackHandler,FlatList,Image,Modal,PanResponder,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import NativeMediaFilm from '../shared/NativeMediaFilm';
import {NativeAlbumGradient,NativeAlbumShade} from '../shared/NativeEmeraldMotion';
import NativeBook from '../book/NativeBook';
import type {NativeFamilyLists} from '../shared/native-module-list';
import {getFamilyDirectory,getFamilyAlbumMedia,familyAlbumCount,HAVANA_V2_DEV_API_BASE_URL,
 type FamilyAlbum,type FamilyDirectory,type FamilyMediaItem} from '@havana/shared';

// Reuse the same short-lived private Family grants as PWA; no public R2 URL.
function privateUrl(value:string|null|undefined):string|null{
 if(!value)return null;
 try{
  const base=new URL(HAVANA_V2_DEV_API_BASE_URL);
  const url=new URL(value,base);
  return url.protocol==='https:'&&url.origin===base.origin&&
   url.pathname.startsWith('/api/family/media/')?url.href:null;
 }catch{return null;}
}
type ReadyMedia={id:string;kind:'photo'|'video';image:string|null;file:string};
export default function NativeFamily({token,onBackHome,lists,bookTick}:{token:string;onBackHome?:()=>void;lists:NativeFamilyLists<FamilyDirectory,FamilyMediaItem[]>;bookTick:number}){
 const snapshot=useSyncExternalStore(lists.directory.subscribe,lists.directory.getSnapshot);
 const directory=snapshot.data;
 const loading=snapshot.loading;
 const [directorySeen,setDirectorySeen]=useState(()=>directory!==null);
 const [selected,setSelected]=useState<string|null>(null);
 const albumList=useMemo(()=>lists.album(selected),[lists,selected]);
 const albumSnapshot=useSyncExternalStore(albumList.subscribe,albumList.getSnapshot);
 const error=snapshot.error||(selected?albumSnapshot.error:'');
 const [focused,setFocused]=useState<number|null>(null);
 const [filmChrome,setFilmChrome]=useState(true);
 useEffect(()=>{setFilmChrome(true);},[focused]);
 const {width:screenWidth}=useWindowDimensions();
 const [galleryWidth,setGalleryWidth]=useState(0);
 const tileSize=Math.max(1,Math.floor(((galleryWidth||screenWidth-40)-10)/3));
 const active=directory?.albums.find(a=>a.actorId===selected);
 const mediaReady=active?.mediaReady===true;
 const mediaLoading=mediaReady&&albumSnapshot.loading;
 const items=mediaReady?(albumSnapshot.data??[]):[];
 // The already existing profile connection supplies bookTick on ready,
 // reconnect, foreground and invalidation. No extra Family socket.
 useEffect(()=>{
  void lists.directory.load(()=>getFamilyDirectory(token));
 },[lists,token,bookTick]);
 useEffect(()=>{
  if(directory){
   setDirectorySeen(true);
   if(selected&&!directory.albums.some(a=>a.actorId===selected)){
    setSelected(null);setFocused(null);
   }
  }
 },[directory,selected]);
 useEffect(()=>{
  if(selected&&mediaReady){
   const actorId=selected;
   void albumList.load(async()=>(await getFamilyAlbumMedia(token,actorId)).items);
  }
 },[albumList,token,selected,mediaReady,bookTick]);
 // Never continue showing a private file after the server invalidates its list.
 useEffect(()=>{setFocused(null);},[bookTick]);
 // The actual visible Image components own the cover/thumbnail downloads.
 // Do not enqueue the same images a second time with Image.prefetch.
 const open=(album:FamilyAlbum)=>{
  setSelected(album.actorId);setFocused(null);
 };
 const back=()=>{setSelected(null);setFocused(null);};
 const cover=privateUrl(active?.coverUrl);
 const ready=useMemo<ReadyMedia[]>(()=>items.flatMap(item=>{
  const url=privateUrl(item.fileUrl);
  return url?[{id:item.id,kind:item.kind,
   image:privateUrl(item.thumbnailUrl)|| (item.kind==='photo'?url:null),file:url}]:[];
 }),[items]);
 const chosen=mediaReady&&focused!==null?(ready[focused]??null):null;
 const change=(step:number)=>setFocused(current=>current===null||!ready.length?null:
  (current+step+ready.length)%ready.length);
 const actions=useRef({back:()=>{},home:()=>{},change:(step:number)=>{},close:()=>{},
  selected:false,focused:false});
 actions.current={back,home:()=>onBackHome?.(),change,close:()=>setFocused(null),
  selected:!!selected,focused:focused!==null};
 const albumBack=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>false,
  onMoveShouldSetPanResponder:(_,g)=>g.x0<32&&g.dx>25&&Math.abs(g.dy)<42,
  onPanResponderRelease:(_,g)=>{
   if(g.dx<85||Math.abs(g.dy)>70)return;
   if(actions.current.focused)actions.current.close();
   else if(actions.current.selected)actions.current.back();
   else actions.current.home();
  }
 })).current;
 const mediaPan=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>false,
  onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>28&&Math.abs(g.dx)>Math.abs(g.dy)*1.4,
  onPanResponderRelease:(_,g)=>{
   if(Math.abs(g.dx)<65||Math.abs(g.dy)>70)return;
   if(g.x0<32&&g.dx>95)actions.current.close();
   else actions.current.change(g.dx<0?1:-1);
  }
 })).current;
 useEffect(()=>{
  const sub=BackHandler.addEventListener('hardwareBackPress',()=>{
   if(focused!==null){setFocused(null);return true;}
   if(selected){back();return true;}
   return false;
  });
  return()=>sub.remove();
 },[focused,selected]);
 return <View style={styles.root} onLayout={e=>setGalleryWidth(e.nativeEvent.layout.width)} {...albumBack.panHandlers}>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  {(loading&&!directorySeen||selected&&!active&&loading)?<ActivityIndicator color="#917252"/>:active?
   <FlatList
    style={styles.albumList}
    contentContainerStyle={styles.albumListContent}
    data={mediaLoading&&!ready.length?[]:ready}
    keyExtractor={item=>item.id}
    numColumns={3}
    columnWrapperStyle={styles.galleryRow}
    initialNumToRender={12}
    maxToRenderPerBatch={9}
    windowSize={5}
    removeClippedSubviews={false}
    keyboardShouldPersistTaps="handled"
    ListHeaderComponentStyle={styles.galleryHeader}
    ListHeaderComponent={<>
     <Pressable accessibilityRole="button" accessibilityLabel="Regresar a Familia HAVANA NICE"
      onPress={back} style={styles.back}><Text style={styles.backArrow}>‹</Text></Pressable>
     <View style={styles.hero}>
      <NativeAlbumGradient/>
      {cover?<Image source={{uri:cover,cache:'default'}} style={styles.heroImage}
       resizeMode="cover" fadeDuration={0}/>:
       <Text style={styles.monogram}>{active.name.slice(0,1).toUpperCase()}</Text>}
      <NativeAlbumShade/>
      <View style={styles.heroCaption}>
       <Text style={styles.heroTitle}>{active.name}</Text>
       <Text style={styles.heroCount}>{familyAlbumCount(active)}</Text>
      </View>
     </View>
     {mediaLoading&&!ready.length?<ActivityIndicator color="#917252" style={styles.mediaSpinner}/>:null}
    </>}
    ListEmptyComponent={!mediaLoading
     ?<Text style={styles.empty}>{active.mediaReady?'Todavía no hay fotos ni videos en este álbum.':'El almacenamiento privado aún no está disponible.'}</Text>
     :undefined}
    renderItem={({item,index})=><Pressable
     accessibilityRole="button" accessibilityLabel={'Abrir '+(item.kind==='photo'?'foto':'video')}
     style={[styles.media,{width:tileSize,height:tileSize}]}
     onPress={()=>setFocused(index)}>
     {item.image?<Image source={{uri:item.image,cache:'default'}}
      style={styles.fill} resizeMode="cover" fadeDuration={0}/>:
      <Text style={styles.play}>▶</Text>}
     {item.kind==='video'&&<Text style={styles.videoMark}>▶</Text>}
    </Pressable>}
   />:
   <ScrollView style={styles.albumList} contentContainerStyle={styles.directoryContent}>
    {loading&&<ActivityIndicator color="#917252"/>}
    <View style={styles.albums}>{directory?.albums.map(album=>{
     const image=privateUrl(album.coverUrl);
     return <Pressable key={album.actorId} accessibilityRole="button" style={styles.album}
      onPress={()=>open(album)}>
      <NativeAlbumGradient/>
      {image?<Image source={{uri:image,cache:'default'}}
       style={styles.fill} resizeMode="cover" fadeDuration={0}/>:
       <Text style={styles.monogram}>{album.name.slice(0,1).toUpperCase()}</Text>}
      <NativeAlbumShade/>
      <View style={styles.albumOverlay}><Text style={styles.albumName}>{album.name}</Text>
       <Text style={styles.heroCount}>{familyAlbumCount(album)}</Text></View>
     </Pressable>;
    })}</View>
    <View style={styles.inlineBook} accessibilityLabel="Revista de Familia HAVANA NICE">
     <NativeBook token={token} refreshKey={bookTick} embedded/>
    </View>
   </ScrollView>}
  <Modal visible={chosen!==null} animationType="fade" statusBarTranslucent
   onRequestClose={()=>setFocused(null)}>
   <View style={styles.modal} {...mediaPan.panHandlers}>
    {(chosen?.kind!=='video'||filmChrome)&&<View style={styles.modalHeader}>
     <Text style={styles.modalCounter}>{focused===null?'':(focused+1)+' / '+ready.length}</Text>
     <Pressable accessibilityRole="button" accessibilityLabel="Cerrar visor"
      onPress={()=>setFocused(null)}><Text style={styles.close}>✕</Text></Pressable>
    </View>}
    <View style={styles.modalContent}>
     {chosen?.kind==='photo'?<Image source={{uri:chosen.file}} resizeMode="contain"
      style={{width:'100%',height:'100%'}}/>:
      chosen?.kind==='video'?<NativeMediaFilm key={chosen.id} url={chosen.file} posterUrl={chosen.image} onControlsChange={setFilmChrome}/>:null}
    </View>
    {chosen?.kind!=='video'&&<View style={styles.modalNav}>
     <Pressable accessibilityRole="button" onPress={()=>change(-1)}><Text style={styles.navIcon}>‹</Text></Pressable>
     <Pressable accessibilityRole="button" onPress={()=>change(1)}><Text style={styles.navIcon}>›</Text></Pressable>
    </View>}
   </View>
  </Modal>
 </View>;
}
const styles=StyleSheet.create({
 root:{flex:1,minHeight:0,gap:15},toolbar:{flexDirection:'row',justifyContent:'space-between'},
 albumList:{flex:1,minHeight:0},
 albumListContent:{paddingBottom:35},
 directoryContent:{paddingBottom:42},
 inlineBook:{marginTop:13,marginBottom:20,overflow:'hidden',borderRadius:12},
 galleryHeader:{marginBottom:12},galleryRow:{gap:5,marginBottom:5},
 back:{marginBottom:13,alignSelf:'flex-start',minWidth:44,minHeight:44,paddingHorizontal:10,
  justifyContent:'center',alignItems:'center',borderRadius:24,borderColor:'#d2dfd0',borderWidth:1,
  backgroundColor:'#f7faf2'},
 backArrow:{fontSize:30,color:'#244936',lineHeight:34},
 mediaSpinner:{marginVertical:18},
 eyebrow:{color:'#917252',fontWeight:'700',fontSize:10,letterSpacing:1.4},
 action:{color:'#856243',fontWeight:'700',fontSize:13},error:{color:'#b23d2e',fontSize:13},
 empty:{fontSize:13,color:'#81756b',lineHeight:20,marginVertical:8},
 albums:{flexDirection:'row',flexWrap:'wrap',gap:11},
 album:{width:'48%',aspectRatio:1,backgroundColor:'#173d33',borderRadius:14,overflow:'hidden',justifyContent:'center'},
 fill:{width:'100%',height:'100%',position:'absolute'},monogram:{fontSize:72,color:'#ffffff36',fontFamily:'serif',fontStyle:'italic',textAlign:'center'},
 albumOverlay:{position:'absolute',bottom:0,left:0,right:0,paddingHorizontal:11,paddingVertical:12},
 albumName:{fontSize:17,color:'#fff',fontWeight:'700'},heroCount:{fontSize:12,color:'#fff',marginTop:4},
 hero:{width:'100%',aspectRatio:16/9,maxHeight:260,backgroundColor:'#173d33',
  borderRadius:15,overflow:'hidden',justifyContent:'center'},
 heroImage:{width:'100%',height:'100%',position:'absolute'},
 heroCaption:{position:'absolute',bottom:0,left:0,right:0,padding:13},
 heroTitle:{color:'#fff',fontSize:25,fontWeight:'700'},
 gallery:{flexDirection:'row',flexWrap:'wrap',gap:5},media:{backgroundColor:'#ddd9d1',borderRadius:6,overflow:'hidden',justifyContent:'center'},
 play:{color:'#555',fontSize:30,textAlign:'center'},
 videoMark:{position:'absolute',bottom:5,right:6,color:'#fff',fontSize:16,fontWeight:'700'},
 bookButton:{padding:24,backgroundColor:'#ede6dc',borderRadius:15,gap:10,marginTop:12},
 bookName:{color:'#3c3833',fontSize:25,fontWeight:'800'},
 modal:{flex:1,backgroundColor:'#101010',justifyContent:'space-between'},
 modalHeader:{position:'absolute',top:0,left:0,right:0,zIndex:5,paddingTop:48,paddingHorizontal:24,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 modalCounter:{color:'#fff',fontSize:14},close:{color:'#fff',fontSize:25},
 modalContent:{flex:1,justifyContent:'center',alignItems:'center'},
 modalNav:{position:'absolute',left:0,right:0,bottom:0,zIndex:5,flexDirection:'row',justifyContent:'space-around',paddingBottom:8,backgroundColor:'#101010a0'},
 navIcon:{color:'#fff',fontSize:38}
});
