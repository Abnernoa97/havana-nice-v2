import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {WebView} from 'react-native-webview';

// BOOK is the exact same PWA PageFlip engine used by the iPhone, framed inside
// the native app. No second native animation engine or separate credentials.
const ORIGIN='https://havana-nice-v2.pages.dev';
const READER=ORIGIN+'/book.html';
const READY='havana-v2-book-ready';
function trustedBookUrl(raw:string):boolean{
 try{
  const url=new URL(raw);
  return url.origin===ORIGIN&&url.pathname==='/book.html'&&!url.search&&!url.hash;
 }catch{return raw==='about:blank';}
}
function dispatchBookEvent(eventName:'havana-v2-book-auth'|'havana-v2-book-refresh',detail?:string):string{
 return '(function(){if(location.origin==='+JSON.stringify(ORIGIN)+
  '&&location.pathname==="/book.html")window.dispatchEvent(new CustomEvent('+
  JSON.stringify(eventName)+
  (detail===undefined?'':',{detail:'+JSON.stringify(detail)+'}')+
  '));})();true;';
}
export default function NativeBook({token,refreshKey,onClose}:{
 token:string;refreshKey:number;onClose:()=>void
}){
 const view=useRef<WebView>(null);
 const [ready,setReady]=useState(false);
 const [failed,setFailed]=useState(false);
 const refreshRef=useRef(refreshKey);
 const onMessage=useCallback((event:{nativeEvent:{data:string;url:string}})=>{
  if(event.nativeEvent.data!==READY||!trustedBookUrl(event.nativeEvent.url))return;
  setReady(true);setFailed(false);
  // Auth is delivered directly to the trusted already-loaded page;
  // never via URL, cookies, persistent storage, or a second session.
  view.current?.injectJavaScript(dispatchBookEvent('havana-v2-book-auth',token));
 },[token]);
 useEffect(()=>{
  if(!ready||refreshRef.current===refreshKey)return;
  refreshRef.current=refreshKey;
  view.current?.injectJavaScript(dispatchBookEvent('havana-v2-book-refresh'));
 },[refreshKey,ready]);
 useEffect(()=>{
  const sub=AppState.addEventListener('change',state=>{
   if(state==='active'&&ready)view.current?.injectJavaScript(dispatchBookEvent('havana-v2-book-refresh'));
  });
  return()=>sub.remove();
 },[ready]);
 return <Modal visible animationType="fade" onRequestClose={onClose}
  statusBarTranslucent presentationStyle="fullScreen">
  <View style={styles.root}>
   <View style={styles.toolbar}>
    <Pressable accessibilityRole="button" accessibilityLabel="Cerrar BOOK HAVANA NICE"
     onPress={onClose} style={styles.back}><Text style={styles.backText}>‹ Volver</Text></Pressable>
    <Text style={styles.title}>BOOK HAVANA NICE</Text>
   </View>
   <WebView ref={view} source={{uri:READER}} originWhitelist={[ORIGIN]}
    style={styles.web} javaScriptEnabled domStorageEnabled={false}
    thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false}
    mixedContentMode="never" setSupportMultipleWindows={false}
    allowsBackForwardNavigationGestures={false} pullToRefreshEnabled={false}
    onShouldStartLoadWithRequest={event=>trustedBookUrl(event.url)}
    onMessage={onMessage}
    onLoadStart={()=>{setReady(false);setFailed(false);}}
    onError={()=>setFailed(true)}
    onHttpError={event=>{if(event.nativeEvent.statusCode>=400)setFailed(true);}}
    renderLoading={()=> <View style={styles.loading}><ActivityIndicator color="#315843"/></View>}
    startInLoadingState
   />
   {failed?<View style={styles.failure} accessibilityRole="alert">
     <Text style={styles.failureText}>No se pudo abrir BOOK. Comprueba tu conexión y vuelve a intentarlo.</Text>
     <Pressable accessibilityRole="button" onPress={()=>{setFailed(false);view.current?.reload();}}>
      <Text style={styles.tryAgain}>Reintentar</Text>
     </Pressable>
   </View>:null}
  </View>
 </Modal>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#f3eddf',paddingTop:32},
 toolbar:{minHeight:50,flexDirection:'row',alignItems:'center',paddingHorizontal:13,gap:18,
  borderBottomWidth:1,borderColor:'#d8d0c2',backgroundColor:'#f8f5ee'},
 back:{paddingHorizontal:10,paddingVertical:12},
 backText:{color:'#2c523c',fontSize:14,fontWeight:'700'},
 title:{fontSize:13,color:'#274632',letterSpacing:1.5,fontWeight:'800'},
 web:{flex:1,backgroundColor:'#f3eddf'},
 loading:{flex:1,alignItems:'center',justifyContent:'center'},
 failure:{padding:20,gap:12,backgroundColor:'#fbf3e9'},
 failureText:{fontSize:13,color:'#7e3c32'},
 tryAgain:{fontSize:13,color:'#315843',fontWeight:'700'}
});
