import {useEffect,useRef,useState} from 'react';

// PWA only. iOS Safari records MP4 audio, Android Chrome WebM/Opus.
// No Chat mic implementation is reused: Chat currently has a placeholder only.
export default function StoryVoiceRecorder({disabled,onSend,onRecording}:{
 disabled:boolean;onSend:(audio:Blob)=>Promise<boolean>;onRecording:(value:boolean)=>void;
}){
 const [recording,setRecording]=useState(false);
 const [error,setError]=useState('');
 const [seconds,setSeconds]=useState(0);
 const recorder=useRef<MediaRecorder|null>(null);
 const stream=useRef<MediaStream|null>(null);
 const stopTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const ticker=useRef<ReturnType<typeof setInterval>|null>(null);
 const cancel=useRef(false);
 const clear=()=>{
  if(stopTimer.current){clearTimeout(stopTimer.current);stopTimer.current=null;}
  if(ticker.current){clearInterval(ticker.current);ticker.current=null;}
  stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
 };
 useEffect(()=>()=>{cancel.current=true;clear();try{recorder.current?.stop();}catch{}},[]);
 const start=async()=>{
  setError('');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
   setError('Este navegador no permite grabar audio.');return;
  }
  try{
   const options=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg'];
   const selected=options.find(type=>MediaRecorder.isTypeSupported(type));
   if(!selected){setError('Formato de audio no compatible.');return;}
   const mic=await navigator.mediaDevices.getUserMedia({audio:true});
   stream.current=mic;cancel.current=false;setSeconds(0);
   const chunks:BlobPart[]=[];
   const writer=new MediaRecorder(mic,{mimeType:selected});
   recorder.current=writer;
   writer.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   writer.onerror=()=>setError('No se pudo grabar el mensaje.');
   writer.onstop=()=>{
    const discard=cancel.current;clear();
    recorder.current=null;setRecording(false);onRecording(false);
    if(discard)return;
    const audio=new Blob(chunks,{type:selected.split(';')[0]!});
    if(audio.size>3_000_000){setError('El mensaje de voz supera 3 MB.');return;}
    if(!audio.size){setError('El audio está vacío.');return;}
    void onSend(audio);
   };
   writer.start(500);
   setRecording(true);onRecording(true);
   ticker.current=setInterval(()=>setSeconds(n=>n+1),1000);
   stopTimer.current=setTimeout(()=>{if(writer.state==='recording')writer.stop();},45000);
  }catch{
   clear();setRecording(false);onRecording(false);
   setError('No se pudo acceder al micrófono.');
  }
 };
 const stop=(discard=false)=>{
  cancel.current=discard;
  const writer=recorder.current;
  if(writer?.state==='recording')writer.stop();
  else{clear();setRecording(false);onRecording(false);}
 };
 return <div className="hn-story-voice">
  {recording?<>
   <span className="hn-story-recording">● Grabando voz · {seconds}s / 45s</span>
   <button type="button" onClick={()=>stop(true)} aria-label="Cancelar audio">Cancelar</button>
   <button type="button" onClick={()=>stop()} aria-label="Enviar mensaje de voz">Enviar voz</button>
  </>:<button type="button" disabled={disabled} onClick={()=>void start()}
   className="hn-story-microphone" aria-label="Grabar mensaje de voz">🎤</button>}
  {error&&<small role="alert">{error}</small>}
 </div>;
}
