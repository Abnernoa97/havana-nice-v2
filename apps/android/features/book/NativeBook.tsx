import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Modal,Pressable,StyleSheet,Text,View} from 'react-native';
import {WebView} from 'react-native-webview';

// Android owns the ONE musician session and native navigation. The existing
// PWA BookReader owns the ONE 3D PageFlip engine. The initial WebView object
// delivers the same session before React boot, without URLs, browser logins,
// persistent web storage or async authorization handshake races.
const ORIGIN='https://havana-nice-v2.pages.dev';
const READER=ORIGIN+'/book.html';
const REFRESH_JS='(function(){if(location.origin==='+JSON.stringify(ORIGIN)+
 '&&location.pathname==="/book.html")window.dispatchEvent(new Event("havana-v2-book-refresh"));})();true;';

function trustedBookUrl(raw:string):boolean{
 if(raw==='about:blank')return true;
 try{
  const url=new URL(raw);
  return url.origin===ORIGIN&&url.pathname==='/book.html'&&!url.search&&!url.hash;
 }catch{return false;}
}

export default function NativeBook({token,refreshKey,onClose,calendarEventId,calendarTitle}:{
 token:string;refreshKey:number;onClose:()=>void;calendarEventId?:string;calendarTitle?:string;
}){
 const view=useRef<WebView<object>>(null);
 const lastRefresh=useRef(refreshKey);
 const [viewKey,setViewKey]=useState(0);
 const [failed,setFailed]=useState('');
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
 const retry=()=>{setFailed('');setViewKey(n=>n+1);};
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
    onLoadStart={()=>setFailed('')}
    onError={()=>setFailed('No se pudo cargar el lector de HAVANA NICE.')}
    onHttpError={event=>{
     if(event.nativeEvent.statusCode>=400)
      setFailed('No se pudo descargar el lector 3D.');
    }}
    onRenderProcessGone={()=>setFailed('Android cerró el lector para liberar memoria.')}
   />
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
 failure:{padding:18,gap:12,backgroundColor:'#fffaf2',alignItems:'center'},
 failureText:{color:'#863f34',fontSize:13,textAlign:'center'},
 retry:{color:'#315843',fontSize:14,fontWeight:'800'}
});
