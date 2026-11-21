import React,{useEffect,useRef,useState} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {AudioModule,RecordingPresets,setAudioModeAsync,useAudioRecorder} from 'expo-audio';

// Android microphone uses Expo audio, independent of browser capture and Chat.
// 45 seconds max; output .m4a/AAC, sent to the same private R2 voice API.
export default function NativeStoryVoiceRecorder({disabled,onRecording,onSend}:{
 disabled:boolean;onRecording:(active:boolean)=>void;onSend:(uri:string)=>Promise<boolean>;
}){
 const recorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
 const [recording,setRecording]=useState(false);
 const [seconds,setSeconds]=useState(0);
 const [error,setError]=useState('');
 const active=useRef(false),working=useRef(false);
 const ticker=useRef<ReturnType<typeof setInterval>|null>(null);
 const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clear=()=>{
  if(ticker.current){clearInterval(ticker.current);ticker.current=null;}
  if(deadline.current){clearTimeout(deadline.current);deadline.current=null;}
 };
 const stop=async(discard:boolean)=>{
  if(!active.current||working.current)return;
  working.current=true;active.current=false;clear();
  try{
   await recorder.stop();
   const uri=recorder.uri;
   setRecording(false);onRecording(false);
   if(!discard&&uri)await onSend(uri);
  }catch{setError('No se pudo finalizar la grabación.');setRecording(false);onRecording(false);}
  finally{working.current=false;}
 };
 const start=async()=>{
  if(disabled||active.current||working.current)return;
  working.current=true;setError('');setSeconds(0);
  try{
   const perm=await AudioModule.requestRecordingPermissionsAsync();
   if(!perm.granted)throw Error('Permite utilizar el micrófono.');
   await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});
   await recorder.prepareToRecordAsync();
   recorder.record();
   active.current=true;setRecording(true);onRecording(true);
   ticker.current=setInterval(()=>setSeconds(v=>v+1),1000);
   deadline.current=setTimeout(()=>void stop(false),45000);
  }catch(e){setError(e instanceof Error?e.message:'No se pudo abrir el micrófono.');}
  finally{working.current=false;}
 };
 useEffect(()=>()=>{clear();if(active.current){active.current=false;void recorder.stop().catch(()=>{});}},[recorder]);
 return <View style={[s.group,recording&&s.recording]}>
  {recording?<>
   <Text style={s.recordLabel}>● Grabando voz · {seconds}s / 45s</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Cancelar nota de voz"
    onPress={()=>void stop(true)} style={s.action}><Text style={s.actionText}>Cancelar</Text></Pressable>
   <Pressable accessibilityRole="button" accessibilityLabel="Enviar nota de voz"
    onPress={()=>void stop(false)} style={s.action}><Text style={s.actionText}>Enviar voz</Text></Pressable>
  </>:<Pressable accessibilityRole="button" accessibilityLabel="Grabar mensaje de voz"
   disabled={disabled} onPress={()=>void start()} style={s.mic}>
    <Text style={s.micText}>🎤</Text>
   </Pressable>}
  {!!error&&<Text style={s.error}>{error}</Text>}
 </View>;
}
const s=StyleSheet.create({
 group:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
 recording:{backgroundColor:'#123629',borderWidth:1,borderColor:'#b3bbaa57',
  borderRadius:22,padding:9,alignSelf:'center',flexWrap:'wrap'},
 mic:{minWidth:38,height:38,borderRadius:19,backgroundColor:'#1d4837',borderWidth:1,
  borderColor:'#ffffff45',justifyContent:'center',alignItems:'center'},
 micText:{fontSize:19},
 recordLabel:{fontSize:12,color:'#ffc8bb',fontWeight:'700'},
 action:{backgroundColor:'#28533e',paddingHorizontal:10,paddingVertical:10,borderRadius:17},
 actionText:{color:'#fff',fontSize:12,fontWeight:'600'},
 error:{color:'#ffb8ad',fontSize:11,maxWidth:190},
});
