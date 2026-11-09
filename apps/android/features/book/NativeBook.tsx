import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {WebView} from 'react-native-webview';

// Android owns the ONE musician session and native navigation. The existing
// PWA BookReader owns the ONE 3D PageFlip engine. The initial WebView object
// delivers the same session before React boot, without URLs, browser logins,
// persistent web storage or async authorization handshake races.
const ORIGIN='https://havana-nice-v2.pages.dev';
// Cloudflare Pages canonicalizes /book.html to /book. Navigate directly to
// the canonical URL: WebView must never reject the redirect to its own reader.
const READER=ORIGIN+'/book';
type ReaderPhase='opening-page'|'html-loaded'|'script-started'|'session-received'|'pages-loading';
const REFRESH_JS='(function(){if(location.origin==='+JSON.stringify(ORIGIN)+
 '&&location.pathname==="/book")window.dispatchEvent(new Event("havana-v2-book-refresh"));})();true;';

function trustedBookUrl(raw:string):boolean{
 if(raw==='about:blank')return true;
 try{
  const url=new URL(raw);
  return url.origin===ORIGIN&&url.pathname==='/book'&&!url.search&&!url.hash;
 }catch{return false;}
}

export default function NativeBook({token,refreshKey,onClose,calendarEventId,calendarTitle}:{
 token:string;refreshKey:number;onClose:()=>void;calendarEventId?:string;calendarTitle?:string;
}){
 const view=useRef<WebView<object>>(null);
 const lastRefresh=useRef(refreshKey);
 const [viewKey,setViewKey]=useState(0);
 const [failed,setFailed]=useState('');
 const [readerReady,setReaderReady]=useState(false);
 const [readerPhase,setReaderPhase]=useState<ReaderPhase>('opening-page');
 const readerWatchdog=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clearReaderWatchdog=()=>{
  if(readerWatchdog.current!==null)clearTimeout(readerWatchdog.current);
  readerWatchdog.current=null;
 };
 const phaseRef=useRef<ReaderPhase>('opening-page');
 const updatePhase=(next:ReaderPhase)=>{
  phaseRef.current=next;
  setReaderPhase(next);
 };
 const armReaderWatchdog=()=>{
  clearReaderWatchdog();
  readerWatchdog.current=setTimeout(()=>{
   readerWatchdog.current=null;
   setFailed(phaseRef.current==='opening-page'?
    'La página de la revista no respondió. Reintenta.':
    phaseRef.current==='html-loaded'?
    'La página abrió, pero no arrancó el lector web. Reintenta.':
    phaseRef.current==='script-started'?
    'El lector web arrancó, pero no pudo recibir la sesión nativa. Reintenta.':
    'El lector recibió la sesión, pero no terminó de dibujar las páginas. Reintenta.');
  },24000);
 };
 useEffect(()=>{
  armReaderWatchdog();
  return()=>clearReaderWatchdog();
 },[viewKey]);
 const onReaderStatus=(raw:string)=>{
  try{
   const value:unknown=JSON.parse(raw);
   if(!value||typeof value!=='object')return;
   const message=value as Record<string,unknown>;
   if(message.type==='havana-v2-book-phase'){
    if(message.phase==='boot')updatePhase('script-started');
    else if(message.phase==='session')updatePhase('session-received');
    else if(message.phase==='pages')updatePhase('pages-loading');
    return;
   }
   if(message.type!=='havana-v2-book-status')return;
   if(message.status==='ready'){
    clearReaderWatchdog();setReaderReady(true);setFailed('');
   }else if(message.status==='error'){
    clearReaderWatchdog();setFailed('No se pudo dibujar la revista 3D. Reintenta.');
   }
  }catch{/* Ignore malformed web messages. */}
 };
 const nativeContext=useMemo(()=>({
  token,eventId:calendarEventId||'',title:(calendarTitle||'').slice(0,160)
 }),[token,calendarEventId,calendarTitle]);
 const refreshBook=()=>view.current?.injectJavaScript(REFRESH_JS);
 useEffect(()=>{
  if(lastRefresh.current===refreshKey)return;
  lastRefresh.current=refreshKey;
  refreshBook();
 },[refreshKey]);
 useEffect(()=>{
  const sub=AppState.addEventListener('change',state=>{
   if(state==='active')refreshBook();
  });
  return()=>sub.remove();
 },[]);
 const retry=()=>{clearReaderWatchdog();setReaderReady(false);updatePhase('opening-page');setFailed('');setViewKey(n=>n+1);};
 const loadingLabel=readerPhase==='opening-page'?'Conectando al lector…':
  readerPhase==='html-loaded'?'Iniciando lector web…':
  readerPhase==='script-started'?'Conectando sesión autorizada…':
  'Preparando páginas de la revista…';
 return <Modal visible animationType="fade" onRequestClose={onClose}
  statusBarTranslucent presentationStyle="fullScreen">
  <View style={styles.root}>
   <View style={styles.toolbar}>
    <Pressable accessibilityRole="button" accessibilityLabel="Volver al módulo"
     onPress={onClose} style={styles.back}><Text style={styles.backText}>‹ Volver</Text></Pressable>
    <Text style={styles.title}>{calendarEventId?'RECUERDOS · HAVANA NICE':'BOOK HAVANA NICE'}</Text>
   </View>
   <WebView<object> key={viewKey} ref={view}
    source={{uri:READER}}
    injectedJavaScriptObject={nativeContext}
    originWhitelist={[ORIGIN]}
    onShouldStartLoadWithRequest={event=>trustedBookUrl(event.url)}
    javaScriptEnabled domStorageEnabled={false}
    thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false}
    mixedContentMode="never" setSupportMultipleWindows={false}
    allowsBackForwardNavigationGestures={false} pullToRefreshEnabled={false}
    startInLoadingState
    style={styles.web}
    onLoadStart={()=>{setReaderReady(false);updatePhase('opening-page');setFailed('');armReaderWatchdog();}}
    onLoadEnd={()=>{if(phaseRef.current==='opening-page')updatePhase('html-loaded');}}
    // Navigation is already restricted to READER and frames are blocked by the
    // book.html CSP. WebView message URLs differ across Android versions;
    // validate the small status schema rather than silently dropping messages.
    onMessage={event=>onReaderStatus(event.nativeEvent.data)}
    onError={()=>{clearReaderWatchdog();setFailed('No se pudo cargar el lector de HAVANA NICE.');}}
    onHttpError={event=>{
     if(event.nativeEvent.statusCode>=400&&event.nativeEvent.url===READER){
      clearReaderWatchdog();setFailed('No se pudo descargar el lector 3D.');
     }
    }}
    onRenderProcessGone={()=>{clearReaderWatchdog();setFailed('Android cerró el lector para liberar memoria.');}}
   />
   {!readerReady&&!failed&&<View style={styles.loading} pointerEvents="none">
    <ActivityIndicator size="large" color="#315843"/>
    <Text style={styles.loadingText}>{loadingLabel}</Text>
   </View>}
   {!!failed&&<View style={styles.failure} accessibilityRole="alert">
    <Text style={styles.failureText}>{failed}</Text>
    <Pressable accessibilityRole="button" onPress={retry}>
     <Text style={styles.retry}>Reintentar</Text>
    </Pressable>
   </View>}
  </View>
 </Modal>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#f3eddf',paddingTop:32},
 toolbar:{minHeight:50,flexDirection:'row',alignItems:'center',paddingHorizontal:13,gap:15,
  borderBottomWidth:1,borderColor:'#d8d0c2',backgroundColor:'#f8f5ee'},
 back:{paddingHorizontal:10,paddingVertical:12},
 backText:{color:'#2c523c',fontSize:15,fontWeight:'700'},
 title:{flexShrink:1,fontSize:13,color:'#274632',letterSpacing:1.4,fontWeight:'800'},
 web:{flex:1,backgroundColor:'#f3eddf'},
 // Do NOT mask the embedded page. Its own error/reader must remain visible.
 loading:{position:'absolute',top:88,left:12,right:12,alignItems:'center',
  justifyContent:'center',flexDirection:'row',gap:10,padding:10,
  backgroundColor:'#f3eddfed',borderRadius:10},
 loadingText:{color:'#315843',fontSize:12,fontWeight:'600'},
 failure:{position:'absolute',bottom:22,left:14,right:14,padding:18,gap:14,
  justifyContent:'center',backgroundColor:'#fffaf2',borderRadius:12,alignItems:'center'},
 failureText:{color:'#863f34',fontSize:14,textAlign:'center',lineHeight:22},
 retry:{color:'#315843',fontSize:14,fontWeight:'800'}
});
