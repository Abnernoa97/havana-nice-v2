// Real native Android Chat microphone (Expo Audio), with a stable retry ID.
import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder} from 'expo-audio';

function uuid(){
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,k=>{
  const random=Math.floor(Math.random()*16);
  return (k==='x'?random:(random&3|8)).toString(16);
 });
}
export default function NativeChatVoiceRecorder({disabled,onSend}:{
 disabled:boolean;onSend:(uri:string,id:string)=>Promise<boolean>;
}){
 const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
 const [recording,setRecording]=useState(false),[busy,setBusy]=useState(false);
 const [seconds,setSeconds]=useState(0),[error,setError]=useState('');
 const [pending,setPending]=useState<{uri:string;id:string}|null>(null);
 const active=useRef(false),working=useRef(false);
 const tick=useRef<ReturnType<typeof setInterval>|null>(null);
 const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clear=()=>{
  if(tick.current){clearInterval(tick.current);tick.current=null;}
  if(deadline.current){clearTimeout(deadline.current);deadline.current=null;}
 };
 const submit=async(item:{uri:string;id:string})=>{
  setBusy(true);setError('');
  try{
   const sent=await onSend(item.uri,item.id);
   if(sent)setPending(null);
   else{setPending(item);setError('No se envió el audio. Reintentar.');}
  }catch{setPending(item);setError('No se envió el audio. Reintentar.');}
  finally{setBusy(false);}
 };
 const stop=async(discard:boolean)=>{
  if(!active.current||working.current)return;
  working.current=true;active.current=false;clear();
  try{
   await recorder.stop();
   const uri=recorder.uri;
   setRecording(false);
   // Restore playback audio mode for other Chat/Audio elements.
   await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true});
   if(!discard&&uri)await submit({uri,id:uuid()});
  }catch{setRecording(false);setError('No se pudo terminar la grabación.');}
  finally{working.current=false;}
 };
 const start=async()=>{
  if(disabled||busy||working.current||active.current)return;
  working.current=true;setError('');setSeconds(0);
  try{
   const permission=await AudioModule.requestRecordingPermissionsAsync();
   if(!permission.granted)throw Error('Autoriza el uso del micrófono.');
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
   await recorder.prepareToRecordAsync();recorder.record();
   active.current=true;setRecording(true);
   tick.current=setInterval(()=>setSeconds(n=>n+1),1000);
   deadline.current=setTimeout(()=>{void stop(false);},45000);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo abrir el micrófono.');}
  finally{working.current=false;}
 };
 useEffect(()=>()=>{clear();if(active.current){active.current=false;void recorder.stop().catch(()=>{});}},[recorder]);
 return <View style={s.root}>
  {recording?<View style={s.actions}>
    <Text style={s.time}>● {seconds}s</Text>
    <Pressable accessibilityRole="button" onPress={()=>void stop(true)} style={s.action}>
     <Text style={s.actionText}>Cancelar</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={()=>void stop(false)} style={s.action}>
     <Text style={s.actionText}>Enviar</Text>
    </Pressable>
   </View>:pending?<View style={s.actions}>
    <Pressable accessibilityRole="button" onPress={()=>{setPending(null);setError('');}} style={s.action}>
     <Text style={s.actionText}>Descartar</Text>
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void submit(pending)} style={s.action}>
     <Text style={s.actionText}>Reintentar</Text>
    </Pressable>
   </View>:<Pressable accessibilityRole="button" accessibilityLabel="Grabar mensaje de voz"
     disabled={disabled||busy} onPress={()=>void start()} style={s.mic}>
     <Text style={s.micText}>{busy?'…':'🎙'}</Text>
   </Pressable>}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 </View>;
}
const s=StyleSheet.create({
 root:{position:'relative',alignItems:'center',justifyContent:'center'},
 mic:{width:51,height:51,borderRadius:26,backgroundColor:'#242522',
  alignItems:'center',justifyContent:'center'},
 micText:{fontSize:22,color:'#fff'},
 actions:{flexDirection:'row',alignItems:'center',gap:6,
  backgroundColor:'#173d2e',borderRadius:22,paddingHorizontal:5,paddingVertical:7},
 time:{color:'#fff',fontSize:11},
 action:{backgroundColor:'#f5f1e6',borderRadius:14,padding:7},
 actionText:{fontSize:11,fontWeight:'700',color:'#1a4030'},
 error:{position:'absolute',bottom:54,right:0,minWidth:160,maxWidth:260,
  backgroundColor:'#fff3e9',color:'#913e30',padding:8,borderRadius:9,fontSize:11},
});
