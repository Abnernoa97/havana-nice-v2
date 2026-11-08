import React,{useCallback,useEffect,useRef,useState} from 'react';
import {
 ActivityIndicator,Alert,AppState,FlatList,Image,Linking,Modal,Pressable,
 StyleSheet,Text,View,useWindowDimensions
} from 'react-native';
import {
 BOOK_GRANT_RENEW_MS,bookMediaUrl,getBookPages,getCalendarMemories,pwaReaderUrl,
 type BookPage
} from '@havana/shared';

// Native is a fast, read-only fallback for the EXISTING authorized session.
// The ONLY 3D PageFlip engine stays in the browser PWA. No WebView bridge,
// duplicate login, media proxy, app tokens in links or second rendering engine.
type ReaderPage=Pick<BookPage,'id'|'url'|'fit'|'position'>;
export default function NativeBook({token,refreshKey,onClose,calendarEventId,calendarTitle}:{
 token:string;refreshKey:number;onClose:()=>void;calendarEventId?:string;calendarTitle?:string;
}){
 const {width,height}=useWindowDimensions();
 const list=useRef<FlatList<ReaderPage>|null>(null);
 const generation=useRef(0);
 const [pages,setPages]=useState<ReaderPage[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [index,setIndex]=useState(0);
 const refresh=useCallback(async()=>{
  const request=++generation.current;
  try{
   const result:ReaderPage[]=calendarEventId
    ?(await getCalendarMemories(token,calendarEventId)).map(photo=>({
      id:photo.id,url:photo.url,fit:photo.fit,position:photo.position
     }))
    :await getBookPages(token);
   if(request!==generation.current)return;
   setPages(result);setError('');setLoading(false);
  }catch(reason){
   if(request!==generation.current)return;
   setLoading(false);
   setError(reason instanceof Error?reason.message:'No se pudieron cargar las fotografías.');
  }
 },[token,calendarEventId]);
 useEffect(()=>{
  setLoading(true);setPages([]);setIndex(0);
  void refresh();
  const app=AppState.addEventListener('change',state=>{
   if(state==='active')void refresh(); // Renew the existing short-lived private R2 grants.
  });
  return()=>{generation.current++;app.remove();};
 },[refresh,refreshKey]);
 useEffect(()=>{
  if(!pages.length)return;
  const timer=setTimeout(()=>{
   if(AppState.currentState==='active')void refresh();
  },BOOK_GRANT_RENEW_MS);
  return()=>clearTimeout(timer);
 },[pages,refresh]);
 const choose=(next:number)=>{
  if(next<0||next>=pages.length)return;
  setIndex(next);
  list.current?.scrollToOffset({offset:next*width,animated:true});
 };
 const openPwa3D=()=>{
  // Browser storage is separate from Expo. The one-installation owner is NEVER
  // bypassed and credentials must never appear in query, fragment or storage.
  const target=calendarEventId?{kind:'memory' as const,eventId:calendarEventId}:{kind:'book' as const};
  let url:string;
  try{url=pwaReaderUrl(target);}catch{return;}
  Alert.alert('BOOK 3D en PWA',
   'El efecto 3D se abre en el navegador y necesita una sesión web ya autorizada. La sesión de Android no se transfiere ni se vuelve a registrar el mismo nombre.',
   [{text:'Cancelar',style:'cancel'},
    {text:'Abrir PWA',onPress:()=>void Linking.openURL(url)}]);
 };
 const imageHeight=Math.max(250,Math.min(height*0.64,680));
 return <Modal visible animationType="slide" onRequestClose={onClose}
  statusBarTranslucent presentationStyle="fullScreen">
  <View style={styles.root}>
   <View style={styles.toolbar}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cerrar BOOK"
     onPress={onClose} style={styles.back}>
     <Text style={styles.backText}>‹ Volver</Text>
    </Pressable>
    <Text style={styles.title}>{calendarEventId?'RECUERDOS · HAVANA NICE':'BOOK HAVANA NICE'}</Text>
   </View>
   <Text style={styles.subtitle}>Lectura rápida · fotografías originales autorizadas</Text>
   {!!calendarEventId&&!!calendarTitle&&<Text style={styles.eventTitle}>{calendarTitle}</Text>}
   {loading?<View style={styles.center}><ActivityIndicator color="#315843"/>
     <Text style={styles.status}>Cargando páginas privadas…</Text></View>:
    error?<View style={styles.center}>
     <Text style={styles.error}>{error}</Text>
     <Pressable onPress={()=>{setLoading(true);void refresh();}} accessibilityRole="button">
      <Text style={styles.action}>Reintentar</Text>
     </Pressable>
    </View>:!pages.length?<View style={styles.center}>
     <Text style={styles.status}>Todavía no hay fotografías publicadas.</Text>
    </View>:
    <FlatList
     ref={list} style={styles.gallery} data={pages} horizontal pagingEnabled
     keyExtractor={page=>page.id} initialNumToRender={1}
     maxToRenderPerBatch={2} windowSize={3} removeClippedSubviews={false}
     showsHorizontalScrollIndicator={false}
     getItemLayout={(_,i)=>({length:width,offset:i*width,index:i})}
     onMomentumScrollEnd={event=>{
      setIndex(Math.max(0,Math.min(pages.length-1,
       Math.round(event.nativeEvent.contentOffset.x/width))));
     }}
     renderItem={({item})=>{
      const uri=bookMediaUrl(item.url);
      return <View style={[styles.page,{width}]}>
       {uri?<Image source={{uri}} resizeMode={item.fit==='contain'?'contain':'cover'}
        style={[styles.photo,{height:imageHeight}]}/>:
        <Text style={styles.error}>Imagen no disponible.</Text>}
      </View>;
     }}
    />}
   <View style={styles.footer}>
    <View style={styles.controls}>
     <Pressable accessibilityRole="button" accessibilityLabel="Fotografía anterior"
      disabled={loading||index===0} onPress={()=>choose(index-1)}>
      <Text style={[styles.arrow,index===0&&styles.disabled]}>‹</Text>
     </Pressable>
     <Text style={styles.counter}>{pages.length?index+1:0} / {pages.length}</Text>
     <Pressable accessibilityRole="button" accessibilityLabel="Fotografía siguiente"
      disabled={loading||index>=pages.length-1} onPress={()=>choose(index+1)}>
      <Text style={[styles.arrow,index>=pages.length-1&&styles.disabled]}>›</Text>
     </Pressable>
    </View>
    <Pressable accessibilityRole="button" onPress={openPwa3D}
     style={styles.pwaButton}>
     <Text style={styles.pwaText}>Ver efecto 3D en PWA ↗</Text>
    </Pressable>
   </View>
  </View>
 </Modal>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#f3eddf',paddingTop:32},
 toolbar:{minHeight:53,flexDirection:'row',alignItems:'center',paddingHorizontal:13,gap:15,
  backgroundColor:'#f8f5ee',borderBottomWidth:1,borderColor:'#d8d0c2'},
 back:{paddingHorizontal:10,paddingVertical:12},
 backText:{color:'#2c523c',fontSize:15,fontWeight:'700'},
 title:{flexShrink:1,fontSize:12,color:'#274632',letterSpacing:1.3,fontWeight:'800'},
 subtitle:{textAlign:'center',fontSize:12,color:'#706454',paddingTop:15},
 eventTitle:{textAlign:'center',fontSize:19,color:'#3a4032',fontWeight:'700',paddingHorizontal:16},
 gallery:{flex:1},
 center:{flex:1,alignItems:'center',justifyContent:'center',gap:15,paddingHorizontal:18},
 status:{fontSize:13,color:'#75695a',textAlign:'center'},
 error:{fontSize:13,color:'#a64343',textAlign:'center'},
 action:{fontSize:14,color:'#315843',fontWeight:'800'},
 page:{flex:1,justifyContent:'center',alignItems:'center',paddingHorizontal:16},
 photo:{width:'100%',backgroundColor:'#eee8db',borderRadius:6},
 footer:{backgroundColor:'#f8f5ee',paddingBottom:23,gap:13,paddingHorizontal:18},
 controls:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 counter:{fontSize:14,fontWeight:'700',color:'#35523e'},
 arrow:{fontSize:33,color:'#345541',paddingHorizontal:20},
 disabled:{opacity:0.3},
 pwaButton:{alignSelf:'center',borderWidth:1,borderRadius:18,
  borderColor:'#315843',paddingVertical:11,paddingHorizontal:20},
 pwaText:{fontSize:13,color:'#315843',fontWeight:'700'}
});
