import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {WebView} from 'react-native-webview';

// BOOK is the exact same PWA PageFlip engine used by the iPhone, framed inside
// the native app. No second native animation engine or separate credentials.
const ORIGIN='https://havana-nice-v2.pages.dev';
const READER=ORIGIN+'/book.html';
const READY='havana-v2-book-ready';
const AUTHORIZED='havana-v2-book-authorized';
const BRIDGE_WATCHDOG_MS=12000;
function trustedBookUrl(raw:string):boolean{
 if(raw==='about:blank')return true;
 try{
  const url=new URL(raw);
  return url.origin===ORIGIN&&url.pathname==='/book.html'&&!url.search&&!url.hash;
 }catch{return false;}
}
function dispatchBookEvent(eventName:'havana-v2-book-auth'|'havana-v2-book-refresh'|'havana-v2-book-calendar'|'havana-v2-book-native-probe',detail?:unknown):string{
 return '(function(){if(location.origin==='+JSON.stringify(ORIGIN)+
  '&&location.pathname==="/book.html")window.dispatchEvent(new CustomEvent('+
  JSON.stringify(eventName)+
  (detail===undefined?'':',{detail:'+JSON.stringify(detail)+'}')+
  '));})();true;';
}
export default function NativeBook({token,refreshKey,onClose,calendarEventId,calendarTitle}:{
 token:string;refreshKey:number;onClose:()=>void;calendarEventId?:string;calendarTitle?:string
}){
 const view=useRef<WebView<object>>(null);
 const [ready,setReady]=useState(false);
 const [failed,setFailed]=useState(false);
 const [failureReason,setFailureReason]=useState('');
 const [rendererGone,setRendererGone]=useState(false);
 const [viewKey,setViewKey]=useState(0);
 const trustedMainFrame=useRef(false);
 const watchdog=useRef<ReturnType<typeof setTimeout>|null>(null);
 const refreshRef=useRef(refreshKey);
 const clearWatchdog=useCallback(()=>{
  if(watchdog.current!==null){clearTimeout(watchdog.current);watchdog.current=null;}
 },[]);
 const markFailed=useCallback((reason:string)=>{
  clearWatchdog();setReady(false);setFailed(true);setFailureReason(reason);
 },[clearWatchdog]);
 const restart=()=>{
  clearWatchdog();trustedMainFrame.current=false;
  setReady(false);setFailed(false);setRendererGone(false);
  setFailureReason('');setViewKey(v=>v+1);
 };
 useEffect(()=>()=>clearWatchdog(),[clearWatchdog]);
 const onMessage=useCallback((event:{nativeEvent:{data:string;url?:string}})=>{
  // Verify the primary document independently: Android's message event may
  // omit url. Never trust a subframe or navigate away from the private page.
  if(!trustedMainFrame.current)return;
  if(event.nativeEvent.url&&!trustedBookUrl(event.nativeEvent.url))return;
  if(event.nativeEvent.data===READY){
   // Token is transferred solely by an injected event after the bridge mounts.
   view.current?.injectJavaScript(dispatchBookEvent('havana-v2-book-auth',token));
   if(calendarEventId)view.current?.injectJavaScript(dispatchBookEvent('havana-v2-book-calendar',
    {eventId:calendarEventId,title:calendarTitle||''}));
  }else if(event.nativeEvent.data===AUTHORIZED){
   clearWatchdog();setReady(true);setFailed(false);setFailureReason('');
  }
 },[token,calendarEventId,calendarTitle,clearWatchdog]);
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
    <Text style={styles.title}>{calendarEventId?'RECUERDOS · HAVANA NICE':'BOOK HAVANA NICE'}</Text>
   </View>
   {!rendererGone&&<WebView<object> key={viewKey} ref={view} source={{uri:READER}} originWhitelist={[ORIGIN]}
    style={styles.web} javaScriptEnabled domStorageEnabled={false}
    thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false}
    mixedContentMode="never" setSupportMultipleWindows={false}
    allowsBackForwardNavigationGestures={false} pullToRefreshEnabled={false}
    onShouldStartLoadWithRequest={event=>trustedBookUrl(event.url)}
    onMessage={onMessage}
    onLoadStart={event=>{
     trustedMainFrame.current=event.nativeEvent.url===READER;
     setReady(false);setFailed(false);
     clearWatchdog();
     watchdog.current=setTimeout(()=>markFailed('BOOK no respondió al iniciar. Comprueba la conexión y vuelve a intentarlo.'),
      BRIDGE_WATCHDOG_MS);
    }}
    onLoadEnd={event=>{
     if(event.nativeEvent.url===READER){
      trustedMainFrame.current=true;
      // Recover a ready event missed during Android WebView startup.
      view.current?.injectJavaScript(dispatchBookEvent('havana-v2-book-native-probe'));
     }
    }}
    onError={()=>markFailed('No se pudo cargar la página privada de BOOK.')}
    onHttpError={event=>{
     if(event.nativeEvent.statusCode>=400&&event.nativeEvent.url===READER)
      markFailed('La página BOOK devolvió un error HTTP.');
    }}
    onRenderProcessGone={()=>{
     // The original WebView process is unusable. Never reload that instance.
     setRendererGone(true);trustedMainFrame.current=false;
     markFailed('Android cerró el visor BOOK para liberar memoria.');
    }}
    renderLoading={()=> <View style={styles.loading}><ActivityIndicator color="#315843"/></View>}
    startInLoadingState
   />}
   {!ready&&!failed?<View style={styles.bridgePending} accessibilityRole="text">
     <ActivityIndicator size="small" color="#315843"/>
     <Text style={styles.bridgeText}>Conectando el lector privado…</Text>
   </View>:null}
   {failed?<View style={styles.failure} accessibilityRole="alert">
     <Text style={styles.failureText}>{failureReason||'No se pudo abrir BOOK.'}</Text>
     <Pressable accessibilityRole="button" onPress={restart}>
      <Text style={styles.tryAgain}>Reintentar BOOK</Text>
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
 bridgePending:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10,
  padding:10,backgroundColor:'#f8f5ee'},
 bridgeText:{fontSize:12,color:'#315843'},
 failure:{padding:20,gap:12,backgroundColor:'#fbf3e9'},
 failureText:{fontSize:13,color:'#7e3c32'},
 tryAgain:{fontSize:13,color:'#315843',fontWeight:'700'}
});
