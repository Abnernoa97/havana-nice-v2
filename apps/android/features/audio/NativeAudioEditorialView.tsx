import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {View,StyleSheet} from 'react-native';
import {WebView,type WebViewMessageEvent} from 'react-native-webview';
import {privateAudioUrl} from '@havana/shared';
import {NATIVE_AUDIO_EDITORIAL_HTML} from './nativeAudioEditorialHtml';
import {useNativeVinylMotion} from './useNativeVinylMotion';
import {
 useNativeAudioSnapshot,sendNativeAudioCommand,seekNativeAudio,selectNativeAudioTrack
} from './nativeAudioStore';

// Visual-only parchment/vinyl: receives snapshots from the ONE native Expo Audio
// engine. It cannot open network routes, perform authentication or play audio.
// The HTML uses exactly the editorial CSS authored for the PWA music player.
export default function NativeAudioEditorialView({inline=false,active=true}:{inline?:boolean;active?:boolean}){
 const view=useRef<WebView<object>>(null);
 const snapshot=useNativeAudioSnapshot();
 const [ready,setReady]=useState(false);
 const [height,setHeight]=useState(810);
 const data=useMemo(()=>({
  tracks:snapshot.tracks.map(track=>({
   id:track.id,title:track.title,artist:track.artist,
   coverUrl:privateAudioUrl(track.coverUrl)
  })),
  index:snapshot.index,playing:snapshot.playing,loading:snapshot.loading,
  elapsed:snapshot.elapsed,duration:snapshot.duration,error:snapshot.error
 }),[snapshot]);
 const sendState=useCallback(()=>{
  if(!ready)return;
  // JSON is injected as a JavaScript expression, never as raw HTML; titles
  // and artist names are set with textContent inside the visual surface.
  view.current?.injectJavaScript(
   'window.renderHavanaAudio('+JSON.stringify(data)+');true;'
  );
 },[data,ready]);
 useEffect(()=>{sendState();},[sendState]);
 const onTilt=useCallback((x:number,y:number)=>{
  if(!ready)return;
  // Only bounded numeric degrees reach the visual WebView. Audio itself stays
  // under the existing Expo Audio + MediaSession instance.
  view.current?.injectJavaScript(
   'window.havanaAudioTilt('+x.toFixed(2)+','+y.toFixed(2)+');true;'
  );
 },[ready]);
 useNativeVinylMotion(active&&ready,onTilt);
 const onMessage=useCallback((event:WebViewMessageEvent)=>{
  let msg:{action?:string;index?:number;time?:number;height?:number};
  try{msg=JSON.parse(event.nativeEvent.data);}
  catch{return;}
  switch(msg.action){
   case 'ready':setReady(true);return;
   case 'height':
    if(inline&&typeof msg.height==='number'&&Number.isFinite(msg.height))
     setHeight(old=>Math.abs(old-msg.height!)>3?Math.min(2800,Math.max(320,Math.ceil(msg.height!))):old);
    return;
   case 'play':case 'next':case 'previous':case 'refresh':
    sendNativeAudioCommand(msg.action);return;
   case 'seek':
    if(typeof msg.time==='number')seekNativeAudio(msg.time);return;
   case 'select':
    if(typeof msg.index==='number')selectNativeAudioTrack(msg.index);return;
  }
 },[inline]);
 return <View style={inline?[styles.inline,{height}]:styles.full} pointerEvents="auto">
  <WebView<object> ref={view} source={{html:NATIVE_AUDIO_EDITORIAL_HTML,
    baseUrl:'https://havana-nice-v2.pages.dev/'}} originWhitelist={['about:blank','https://havana-nice-v2.pages.dev']}
   onMessage={onMessage} onLoadEnd={()=>setReady(true)}
   onShouldStartLoadWithRequest={req=>req.url==='about:blank'||
    req.url.startsWith('about:blank?')||req.url==='https://havana-nice-v2.pages.dev/'}
   javaScriptEnabled domStorageEnabled={false} sharedCookiesEnabled={false}
   thirdPartyCookiesEnabled={false} allowFileAccess={false}
   mediaPlaybackRequiresUserAction scrollEnabled={!inline} nestedScrollEnabled={false}
   bounces={false} showsVerticalScrollIndicator={false} overScrollMode="never"
   style={styles.web} automaticallyAdjustContentInsets={false}/>
 </View>;
}
const styles=StyleSheet.create({
 full:{flex:1,minHeight:0,backgroundColor:'#f8f1e8'},
 inline:{width:'100%',backgroundColor:'#f8f1e8'},
 web:{width:'100%',flex:1,backgroundColor:'#f8f1e8'}
});
