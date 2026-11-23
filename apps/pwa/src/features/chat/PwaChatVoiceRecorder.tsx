// iPhone Chat microphone with a retryable R2 note. Independent of Stories.
import {useEffect,useRef,useState} from 'react';
export default function PwaChatVoiceRecorder({disabled,onSend}:{
 disabled:boolean;onSend:(file:File,id:string)=>Promise<boolean>;
}){
 const [recording,setRecording]=useState(false),[paused,setPaused]=useState(false),[seconds,setSeconds]=useState(0);
 const [sending,setSending]=useState(false),[error,setError]=useState('');
 const [pending,setPending]=useState<{file:File;id:string}|null>(null);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null);
 const timer=useRef<ReturnType<typeof setInterval>|null>(null);
 const deadline=useRef<ReturnType<typeof setTimeout>|null>(null);
 const discard=useRef(false),pausedRef=useRef(false);
 const clean=()=>{
  if(timer.current)clearInterval(timer.current);
  if(deadline.current)clearTimeout(deadline.current);
  timer.current=null;deadline.current=null;
  stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
 };
 useEffect(()=>()=>{discard.current=true;clean();try{recorder.current?.stop();}catch{}},[]);
 const submit=async(item:{file:File;id:string})=>{
  setSending(true);setError('');
  try{
   if(await onSend(item.file,item.id))setPending(null);
   else{setPending(item);setError('No se envió. Puedes reintentar.');}
  }catch{setPending(item);setError('No se envió. Puedes reintentar.');}
  finally{setSending(false);}
 };
 const start=async()=>{
  if(disabled||sending||recording)return;
  setError('');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
   setError('Micrófono no disponible.');return;
  }
  try{
   const format=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg']
    .find(m=>MediaRecorder.isTypeSupported(m));
   if(!format)throw Error('Formato de grabación no compatible.');
   const mic=await navigator.mediaDevices.getUserMedia({audio:true});
   stream.current=mic;discard.current=false;setSeconds(0);
   const chunks:BlobPart[]=[],writer=new MediaRecorder(mic,{mimeType:format});
   recorder.current=writer;
   writer.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   writer.onerror=()=>setError('Falló la grabación.');
   writer.onstop=()=>{
    const cancelled=discard.current;clean();recorder.current=null;setRecording(false);setPaused(false);pausedRef.current=false;
    if(cancelled)return;
    const mime=format.split(';')[0]!,blob=new Blob(chunks,{type:mime});
    if(blob.size<1||blob.size>3_000_000){setError('Audio vacío o mayor a 3 MB.');return;}
    const ext=mime==='audio/mp4'?'m4a':mime==='audio/ogg'?'ogg':'webm';
    void submit({file:new File([blob],'Voz.'+ext,{type:mime}),id:crypto.randomUUID()});
   };
   writer.start(300);setRecording(true);setPaused(false);pausedRef.current=false;
   timer.current=setInterval(()=>{if(!pausedRef.current)setSeconds(s=>s+1);},1000);
   deadline.current=setTimeout(()=>{if(writer.state==='recording')writer.stop();},45000);
  }catch(e){clean();setRecording(false);setError(e instanceof Error?e.message:'Sin permiso de micrófono.');}
 };
 const togglePause=()=>{
  const writer=recorder.current;if(!writer)return;
  try{
   if(writer.state==='recording'){
    writer.pause();setPaused(true);pausedRef.current=true;
    if(deadline.current){clearTimeout(deadline.current);deadline.current=null;}
   }else if(writer.state==='paused'){
    writer.resume();setPaused(false);pausedRef.current=false;
    deadline.current=setTimeout(()=>{if(writer.state==='recording')writer.stop();},Math.max(1000,(45-seconds)*1000));
   }
  }catch{setError('No se pudo pausar la grabación.');}
 };
 return <div className="hn-chat-voice-recorder">
  {recording?<div className="hn-chat-voice-actions">
    <span>{paused?'Ⅱ':'●'} {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span>
    <button type="button" aria-label="Borrar nota de voz"
     onClick={()=>{discard.current=true;recorder.current?.stop();}}>▤</button>
    <button type="button" aria-label={paused?'Continuar grabación':'Pausar grabación'}
     onClick={togglePause}>{paused?'▶':'Ⅱ'}</button>
    <button type="button" aria-label="Enviar nota de voz"
     onClick={()=>{discard.current=false;recorder.current?.stop();}}>➤</button>
   </div>:pending?<div className="hn-chat-voice-actions">
    <button type="button" onClick={()=>{setPending(null);setError('');}}>Descartar</button>
    <button type="button" disabled={sending} onClick={()=>void submit(pending)}>Reintentar</button>
   </div>:<button type="button" className="chat-action-circle"
     aria-label="Grabar mensaje de voz" disabled={disabled||sending}
     onClick={()=>void start()}>{sending?'…':'🎙'}</button>}
  {error&&<small role="alert" className="hn-chat-voice-error">{error}</small>}
 </div>;
}
