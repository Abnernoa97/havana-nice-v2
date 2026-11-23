// Lazy private audio player for Chat messages. R2 grants are never persisted.
import {useEffect,useRef,useState} from 'react';
import type {ChatMedia} from './chat-media-types';
import {requestChatMediaUrl} from './chat-media-grant';
export default function ChatVoiceMessage({media,token}:{media:ChatMedia;token:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 const [playing,setPlaying]=useState(false),[at,setAt]=useState(0),[length,setLength]=useState(0);
 const player=useRef<HTMLAudioElement|null>(null);
 const abort=useRef<AbortController|null>(null);
 useEffect(()=>()=>{abort.current?.abort();player.current?.pause();},[]);
 useEffect(()=>{setUrl('');setError('');setPlaying(false);},[media.assetId,token]);
 const start=async()=>{
  if(player.current&&url){
   if(player.current.paused)void player.current.play().catch(()=>setError('No se pudo reproducir.'));
   else player.current.pause();
   return;
  }
  abort.current?.abort();const ctl=new AbortController();abort.current=ctl;
  setError('');
  try{setUrl(await requestChatMediaUrl(media.assetId,token,ctl.signal));}
  catch{if(!ctl.signal.aborted)setError('Audio no disponible. Reintentar.');}
 };
 useEffect(()=>{
  if(url&&player.current)void player.current.play().catch(()=>setError('Pulsa ▶ para reproducir.'));
 },[url]);
 return <div className="hn-chat-audio" role="group" aria-label="Mensaje de voz">
  <button type="button" onClick={()=>void start()} aria-label={playing?'Pausar nota de voz':'Reproducir nota de voz'}>
   {playing?'Ⅱ':'▶'}
  </button>
  <div className="hn-chat-audio-body">
   <div className="hn-chat-audio-progress">
    <input type="range" min={0} max={Math.max(1,length)} step=".1"
     value={Math.min(at,Math.max(1,length))} aria-label="Avanzar audio"
     onChange={e=>{if(player.current)player.current.currentTime=Number(e.target.value);setAt(Number(e.target.value));}}/>
    <small>{Math.floor(at/60)}:{String(Math.floor(at%60)).padStart(2,'0')}</small>
   </div>
   {error&&<small role="alert">{error}</small>}
  </div>
  {url&&<audio ref={player} src={url} preload="metadata"
   onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
   onEnded={()=>setPlaying(false)}
   onLoadedMetadata={e=>setLength(e.currentTarget.duration)}
   onTimeUpdate={e=>setAt(e.currentTarget.currentTime)}/>}
 </div>;
}
