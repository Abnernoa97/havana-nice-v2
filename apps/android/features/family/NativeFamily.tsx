import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,AppState,FlatList,Image,Modal,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {useVideoPlayer,VideoView} from 'expo-video';
import NativeBook from '../book/NativeBook';
import {getFamilyDirectory,getFamilyAlbumMedia,familyAlbumCount,HAVANA_V2_DEV_API_BASE_URL,openFamilyRealtime,FAMILY_WS_HANDSHAKE_TIMEOUT_MS,
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
function NativeVideo({url,width}:{url:string;width:number}){
 const player=useVideoPlayer({uri:url},instance=>{instance.loop=false;});
 return <VideoView player={player} nativeControls contentFit="contain" surfaceType="surfaceView"
  style={{width,height:Math.round(width*1.1),backgroundColor:'#111'}}/>;
}
export default function NativeFamily({token}:{token:string}){
 const [directory,setDirectory]=useState<FamilyDirectory|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [bookTick,setBookTick]=useState(0);
 const [items,setItems]=useState<FamilyMediaItem[]>([]);
 const [focused,setFocused]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const [mediaLoading,setMediaLoading]=useState(false);
 const [error,setError]=useState('');
 const {width:screenWidth,height:screenHeight}=useWindowDimensions();
 const generation=useRef(0),mediaGeneration=useRef(0);
 // Temporary signed grants, reused in memory during this musician session.
 // Never write R2 media URLs or private files to persistent storage.
 const albumCache=useRef(new Map<string,{at:number;items:FamilyMediaItem[]}>());
 const selectedRef=useRef<string|null>(null);
 selectedRef.current=selected;
 const refresh=useCallback(async()=>{
  const id=++generation.current;
  try{
   const data=await getFamilyDirectory(token);
   if(id!==generation.current)return;
   setDirectory(data);setError('');
   // Start fetching the first visible album covers before the user taps.
   for(const album of data.albums.slice(0,5)){
    const cover=privateUrl(album.coverUrl);
    if(cover)void Image.prefetch(cover).catch(()=>{});
   }
  }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'No se pudo abrir Familia HAVANA NICE.');}
  finally{if(id===generation.current)setLoading(false);}
 },[token]);
 const loadAlbum=useCallback(async(actorId:string,force=false)=>{
  const id=++mediaGeneration.current;
  const cached=albumCache.current.get(actorId);
  if(!force&&cached&&Date.now()-cached.at<4*60_000){
   setItems(cached.items);setMediaLoading(false);return;
  }
  // Keep the previous media visible on a realtime refresh.
  if(!cached)setMediaLoading(true);
  try{
   const data=await getFamilyAlbumMedia(token,actorId);
   if(id!==mediaGeneration.current)return;
   albumCache.current.set(actorId,{items:data.items,at:Date.now()});
   setItems(data.items);setError('');
   // Photo JPEGs and video posters only; never prefetch video originals.
   for(const item of data.items.slice(0,8)){
    const thumbnail=privateUrl(item.thumbnailUrl);
    if(thumbnail)void Image.prefetch(thumbnail).catch(()=>{});
   }
  }catch(e){
   if(id===mediaGeneration.current)setError(e instanceof Error?e.message:'No se pudo cargar el álbum.');
  }finally{if(id===mediaGeneration.current)setMediaLoading(false);}
 },[token]);
 useEffect(()=>{
  // One Familia notification-only WebSocket while this module is mounted.
  // Chat and Calendar retain their own existing controllers and backend.
  let active=true,socket:WebSocket|null=null;
  let timer:ReturnType<typeof setTimeout>|null=null;
  let watchdog:ReturnType<typeof setTimeout>|null=null;
  let retryDelay=1000;
  const clear=()=>{
   if(timer!==null){clearTimeout(timer);timer=null;}
   if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
  };
  const synchronize=(force=false)=>{
   setBookTick(value=>value+1);
   void refresh();
   if(force)albumCache.current.clear();
   if(selectedRef.current)void loadAlbum(selectedRef.current,force);
  };
  const connect=()=>{
   if(!active||AppState.currentState==='background'||AppState.currentState==='inactive')return;
   if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING))return;
   clear();
   try{
    const opened=openFamilyRealtime(token,false,event=>{
     if(!active||socket!==opened)return;
     if(event.type==='family.ready'||event.type==='family.invalidate')
      synchronize(event.type==='family.invalidate');
    });
    socket=opened;
    watchdog=setTimeout(()=>{
     if(!active||socket!==opened||opened.readyState===WebSocket.OPEN)return;
     socket=null;try{opened.close();}catch{}
     clear();
     if(AppState.currentState==='active'){
      timer=setTimeout(connect,retryDelay);
      retryDelay=Math.min(20000,retryDelay*2);
     }
    },FAMILY_WS_HANDSHAKE_TIMEOUT_MS);
    opened.onopen=()=>{
     if(active&&socket===opened){
      if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
      retryDelay=1000;
     }
    };
    opened.onclose=event=>{
     if(!active||socket!==opened)return;
     socket=null;
     if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
     if(event.code===4003)return;
     if(AppState.currentState==='active'){
      clear();timer=setTimeout(connect,retryDelay);
      retryDelay=Math.min(20000,retryDelay*2);
     }
    };
    opened.onerror=()=>{if(active&&socket===opened)opened.close();};
   }catch{
    clear();timer=setTimeout(connect,retryDelay);
    retryDelay=Math.min(20000,retryDelay*2);
   }
  };
  albumCache.current.clear();
  setSelected(null);setDirectory(null);setItems([]);setLoading(true);
  synchronize();
  connect();
  const sub=AppState.addEventListener('change',state=>{
   if(state==='active'){synchronize();connect();}
   else{
    clear();
    const old=socket;socket=null;
    if(old&&old.readyState!==WebSocket.CLOSED)old.close();
   }
  });
  return()=>{
   active=false;clear();++generation.current;++mediaGeneration.current;
   sub.remove();socket?.close();
  };
 },[token,refresh,loadAlbum]);
 const open=(album:FamilyAlbum)=>{
  setSelected(album.actorId);setFocused(null);
  const cached=albumCache.current.get(album.actorId);
  if(cached&&Date.now()-cached.at<4*60_000)setItems(cached.items);
  else setItems([]);
  if(album.mediaReady)void loadAlbum(album.actorId);
 };
 const back=()=>{++mediaGeneration.current;setSelected(null);setFocused(null);};
 const active=directory?.albums.find(a=>a.actorId===selected);
 const cover=privateUrl(active?.coverUrl);
 const ready=useMemo<ReadyMedia[]>(()=>items.flatMap(item=>{
  const url=privateUrl(item.fileUrl);
  return url?[{id:item.id,kind:item.kind,
   image:privateUrl(item.thumbnailUrl)|| (item.kind==='photo'?url:null),file:url}]:[];
 }),[items]);
 const chosen=focused!==null?ready[focused]:null;
 const change=(step:number)=>setFocused(current=>current===null||!ready.length?null:
  (current+step+ready.length)%ready.length);
 return <View style={styles.root}>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  {loading?<ActivityIndicator color="#917252"/>:active?
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
    ListHeaderComponent={<>
     <Pressable accessibilityRole="button" accessibilityLabel="Regresar a Familia HAVANA NICE"
      onPress={back} style={styles.back}><Text style={styles.backArrow}>‹</Text></Pressable>
     <View style={styles.hero}>
      {cover?<Image source={{uri:cover,cache:'default'}} style={styles.heroImage}
       resizeMode="cover" fadeDuration={0}/>:
       <Text style={styles.monogram}>{active.name.slice(0,1).toUpperCase()}</Text>}
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
     style={[styles.media,{width:(screenWidth-72)/3,height:(screenWidth-72)/3}]}
     onPress={()=>setFocused(index)}>
     {item.image?<Image source={{uri:item.image,cache:'default'}}
      style={styles.fill} resizeMode="cover" fadeDuration={0}/>:
      <Text style={styles.play}>▶</Text>}
     {item.kind==='video'&&<Text style={styles.videoMark}>▶</Text>}
    </Pressable>}
   />:
   <ScrollView style={styles.albumList} contentContainerStyle={styles.directoryContent}>
    <View style={styles.albums}>{directory?.albums.map(album=>{
     const image=privateUrl(album.coverUrl);
     return <Pressable key={album.actorId} accessibilityRole="button" style={styles.album}
      onPress={()=>open(album)}>
      {image?<Image source={{uri:image,cache:'default'}}
       style={styles.fill} resizeMode="cover" fadeDuration={0}/>:
       <Text style={styles.monogram}>{album.name.slice(0,1).toUpperCase()}</Text>}
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
   <View style={styles.modal}>
    <View style={styles.modalHeader}>
     <Text style={styles.modalCounter}>{focused===null?'':(focused+1)+' / '+ready.length}</Text>
     <Pressable accessibilityRole="button" accessibilityLabel="Cerrar visor"
      onPress={()=>setFocused(null)}><Text style={styles.close}>✕</Text></Pressable>
    </View>
    <View style={styles.modalContent}>
     {chosen?.kind==='photo'?<Image source={{uri:chosen.file}} resizeMode="contain"
      style={{width:screenWidth,height:Math.max(200,screenHeight-185)}}/>:
      chosen?.kind==='video'?<NativeVideo key={chosen.id} url={chosen.file} width={screenWidth-20}/>:null}
    </View>
    <View style={styles.modalNav}>
     <Pressable accessibilityRole="button" onPress={()=>change(-1)}><Text style={styles.navIcon}>‹</Text></Pressable>
     <Pressable accessibilityRole="button" onPress={()=>change(1)}><Text style={styles.navIcon}>›</Text></Pressable>
    </View>
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
 galleryRow:{gap:5,marginBottom:5},
 back:{marginBottom:13,alignSelf:'flex-start',minWidth:44,minHeight:44,paddingHorizontal:10,
  justifyContent:'center',alignItems:'center',borderRadius:24,borderColor:'#d2dfd0',borderWidth:1,
  backgroundColor:'#f7faf2'},
 backArrow:{fontSize:30,color:'#244936',lineHeight:34},
 mediaSpinner:{marginVertical:18},
 eyebrow:{color:'#917252',fontWeight:'700',fontSize:10,letterSpacing:1.4},
 action:{color:'#856243',fontWeight:'700',fontSize:13},error:{color:'#b23d2e',fontSize:13},
 empty:{fontSize:13,color:'#81756b',lineHeight:20,marginVertical:8},
 albums:{flexDirection:'row',flexWrap:'wrap',gap:11},
 album:{width:'48%',aspectRatio:1,backgroundColor:'#675f51',borderRadius:14,overflow:'hidden',justifyContent:'center'},
 fill:{width:'100%',height:'100%',position:'absolute'},monogram:{fontSize:65,color:'#e4ddd0',fontWeight:'700',textAlign:'center'},
 albumOverlay:{position:'absolute',bottom:0,left:0,right:0,padding:13,backgroundColor:'rgba(17,17,17,.66)'},
 albumName:{fontSize:19,color:'#fff',fontWeight:'700'},heroCount:{fontSize:12,color:'#fff',marginTop:4},
 hero:{width:'100%',aspectRatio:16/9,maxHeight:260,backgroundColor:'#756d60',
  borderRadius:15,overflow:'hidden',justifyContent:'center'},
 heroImage:{width:'100%',height:'100%',position:'absolute'},
 heroCaption:{position:'absolute',bottom:0,left:0,right:0,padding:13,
  backgroundColor:'rgba(17,17,17,.63)'},
 heroTitle:{color:'#fff',fontSize:25,fontWeight:'700'},
 gallery:{flexDirection:'row',flexWrap:'wrap',gap:5},media:{backgroundColor:'#ddd9d1',borderRadius:6,overflow:'hidden',justifyContent:'center'},
 play:{color:'#555',fontSize:30,textAlign:'center'},
 videoMark:{position:'absolute',bottom:5,right:6,color:'#fff',fontSize:16,fontWeight:'700'},
 bookButton:{padding:24,backgroundColor:'#ede6dc',borderRadius:15,gap:10,marginTop:12},
 bookName:{color:'#3c3833',fontSize:25,fontWeight:'800'},
 modal:{flex:1,backgroundColor:'#101010',justifyContent:'space-between'},
 modalHeader:{paddingTop:48,paddingHorizontal:24,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 modalCounter:{color:'#fff',fontSize:14},close:{color:'#fff',fontSize:25},
 modalContent:{flex:1,justifyContent:'center',alignItems:'center'},
 modalNav:{flexDirection:'row',justifyContent:'space-around',paddingBottom:35},
 navIcon:{color:'#fff',fontSize:38}
});
