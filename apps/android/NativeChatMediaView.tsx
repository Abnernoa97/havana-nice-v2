import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,Image,Modal,Pressable,Text,View,useWindowDimensions} from 'react-native';
import {File,Paths} from 'expo-file-system';
import {VideoView,useVideoPlayer} from 'expo-video';
import {useEvent} from 'expo';
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
import type {ChatMessage,ChatSession} from '@havana/shared';

type Media=NonNullable<ChatMessage['media']>;
const MAX_ORIGINAL_IMAGE_BYTES=100*1024*1024;
const pendingPhotos=new Map<string,Promise<string>>();
const PARTIAL_TRANSFER_TTL=24*60*60*1000;
let lastPartialTransferSweep=0;

// Only remove incomplete V2 photo downloads that are at least a day old.
// Do not evict verified original photographs, drafts or other app caches.
function pruneAbandonedPhotoTransfers(){
 const now=Date.now();
 if(now-lastPartialTransferSweep<PARTIAL_TRANSFER_TTL)return;
 lastPartialTransferSweep=now;
 try{
  for(const entry of Paths.cache.list()){
   if(!(entry instanceof File)||!/^hn-v2-photo-transfer-[0-9a-f-]+-[0-9]+\.part$/.test(entry.name))continue;
   const modified=entry.modificationTime;
   if(modified!==null&&modified<=now-PARTIAL_TRANSFER_TTL){
    try{entry.delete();}catch{/* Cache cleanup is best effort. */}
   }
  }
 }catch{/* No cache permission or directory? Preserve Chat availability. */}
}

const identifier=(value:string)=>value.replace(/[^0-9a-f-]/gi,'').slice(0,36);
const photoPath=(media:Media)=>{const ext=media.mimeType==='image/png'?'png':media.mimeType==='image/webp'?'webp':media.mimeType==='image/heic'||media.mimeType==='image/heif'?'heic':'jpg';return new File(Paths.cache,'hn-v2-chat-photo-'+identifier(media.assetId)+'-'+media.sizeBytes+'.'+ext);};

// The private app cache is best effort: no Google credentials, device tokens or
// private signed URLs are persisted. Complete originals are atomic on disk.
// A failed/partial download is NEVER opened as a photograph.
async function cacheWholePhoto(media:Media,remoteUrl:string){
 if(media.sizeBytes<=0||media.sizeBytes>MAX_ORIGINAL_IMAGE_BYTES)
  throw Error('Fotografía no admitida');
 const key=identifier(media.assetId)+':'+media.sizeBytes;
 const existing=pendingPhotos.get(key);
 if(existing)return existing;
 const work=(async()=>{
  const cached=photoPath(media);
  if(cached.exists&&cached.size===media.sizeBytes)return cached.uri;
  if(cached.exists)cached.delete();
  pruneAbandonedPhotoTransfers();
  const temporary=new File(Paths.cache,'hn-v2-photo-transfer-'+identifier(media.assetId)+'-'+Date.now()+'.part');
  try{
   const finished=await File.downloadFileAsync(remoteUrl,temporary,{idempotent:true});
   if(!finished.exists||finished.size!==media.sizeBytes)
    throw Error('No se recibió la fotografía completa');
   await finished.move(cached);
   if(!cached.exists||cached.size!==media.sizeBytes)
    throw Error('No se verificó la fotografía original');
   return cached.uri;
  }catch(error){
   if(temporary.exists)temporary.delete();
   throw error;
  }
 })();
 pendingPhotos.set(key,work);
 try{return await work;}
 finally{if(pendingPhotos.get(key)===work)pendingPhotos.delete(key);}
}

function InlineNativeVideo({url,width,onRetry}:{url:string;width:number;onRetry:()=>void}){
 const player=useVideoPlayer({uri:url},value=>{value.loop=false;});
 const {status}=useEvent(player,'statusChange',{status:player.status});
 return <View style={{width,borderRadius:12,backgroundColor:'#171717'}}>
  {/* Prefer Android's supported primary video surface. TextureView has been
      showing native controls but an entirely black video frame on-device. */}
  <VideoView player={player} nativeControls contentFit="contain"
   surfaceType="surfaceView" style={{width,height:Math.round(width*1.16),borderRadius:12}}/>
  {status==='error'?<Pressable accessibilityRole="button" accessibilityLabel="Reintentar video"
    onPress={onRetry} style={{padding:14,alignItems:'center'}}>
    <Text style={{color:'#fff'}}>No se pudo reproducir. Reintentar</Text>
   </Pressable>:null}
 </View>;
}

export default function NativeChatMediaView({
 media,session
}:{media:Media;session:ChatSession}){
 const [signed,setSigned]=useState('');
 const [videoAttempt,setVideoAttempt]=useState(0);
 const [photo,setPhoto]=useState('');
 const [ratio,setRatio]=useState(1);
 const [enlarged,setEnlarged]=useState(false);
 const [error,setError]=useState('');
 const {width:screenWidth,height:screenHeight}=useWindowDimensions();
 const width=useMemo(()=>Math.max(170,Math.min(350,Math.floor(screenWidth*.85)-28)),[screenWidth]);
 const height=Math.max(60,Math.round(width/ratio));

 useEffect(()=>{
  let active=true;
  const abort=new AbortController();
  setSigned('');setPhoto('');setRatio(1);setError('');setEnlarged(false);
  void (async()=>{
   // Reuse a verified original directly from private app cache, including
   // offline views. No new signed grant or network download is needed.
   if(media.kind==='photo'){
    const cached=photoPath(media);
    if(cached.exists&&cached.size===media.sizeBytes){
     Image.getSize(cached.uri,(w,h)=>{if(active){setRatio(w>0&&h>0?w/h:1);setPhoto(cached.uri);}},()=>{});
     return;
    }
   }
   // Refresh signed URLs only for network reads, never persist them.
   const result=await fetch(API+'/api/chat/media/'+media.assetId+'/grant',{
    headers:{Authorization:'Bearer '+session.token},signal:abort.signal
   });
   if(!result.ok)throw Error('Archivo no disponible');
   const grant=await result.json() as {url?:string};
   const url=grant.url||'';
   if(!url.startsWith(API+'/api/chat/media/'))throw Error('Archivo no disponible');
   if(!active)return;
   setSigned(url);
   if(media.kind!=='photo')return;
   const local=await cacheWholePhoto(media,url);
   if(!active)return;
   Image.getSize(local,(w,h)=>{
    if(active){setRatio(w>0&&h>0?w/h:1);setPhoto(local);}
   },()=>{if(active)setError('No se pudo visualizar la fotografía');});
  })().catch(()=>{if(active)setError('Archivo no disponible');});
  return()=>{active=false;abort.abort();};
 },[media.assetId,media.kind,media.sizeBytes,session.token,videoAttempt]);

 return <View style={{marginVertical:3,alignSelf:'flex-start',maxWidth:'100%'}}>
  {media.kind==='photo'?
    photo?
      <Pressable accessibilityLabel="Ampliar fotografía" accessibilityRole="button"
        onPress={()=>setEnlarged(true)}>
       <Image source={{uri:photo}} resizeMode="contain"
        style={{width,height,borderRadius:12}}/>
      </Pressable>:
      error?<Text style={{color:'#7c4141'}}>{error}</Text>:
       <View style={{width,height:92,alignItems:'center',justifyContent:'center'}}>
        <ActivityIndicator color="#77736d"/>
       </View>
    :signed?<InlineNativeVideo key={signed} url={signed} width={width}
       onRetry={()=>setVideoAttempt(count=>count+1)}/>:
      error?<Text style={{color:'#7c4141'}}>{error}</Text>:
       <View style={{width,height:92,alignItems:'center',justifyContent:'center'}}>
        <ActivityIndicator color="#77736d"/>
       </View>}
  <Modal visible={media.kind==='photo'&&enlarged&&!!photo}
    animationType="fade" transparent statusBarTranslucent
    onRequestClose={()=>setEnlarged(false)}>
   <View style={{flex:1,backgroundColor:'#101010',justifyContent:'center',alignItems:'center'}}>
    <Image source={{uri:photo}} resizeMode="contain"
      style={{width:screenWidth,height:screenHeight}}/>
    <Pressable onPress={()=>setEnlarged(false)} accessibilityRole="button"
      accessibilityLabel="Cerrar fotografía ampliada"
      style={{position:'absolute',top:45,right:18,paddingHorizontal:15,paddingVertical:8,
       borderRadius:24,backgroundColor:'#222'}}>
      <Text style={{fontSize:26,color:'#fff'}}>×</Text>
    </Pressable>
   </View>
  </Modal>
 </View>;
}
