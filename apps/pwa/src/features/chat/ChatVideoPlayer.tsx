// Isolated, full-screen lightweight iPhone player. No Safari controls/skip/airplay UI.
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

function durationLabel(value:number):string{
 if(!Number.isFinite(value)||value<0)return '0:00';
 const seconds=Math.floor(value);
 return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}

export default function ChatVideoPlayer({url,poster,error,onRetry,onClose}:{
 url:string;poster:string;error:string;onRetry:()=>void;onClose:()=>void;
}){
 const ref=useRef<HTMLVideoElement|null>(null);
 const [playing,setPlaying]=useState(false);
 const [elapsed,setElapsed]=useState(0);
 const [duration,setDuration]=useState(0);
 useEffect(()=>{
  const before=document.body.style.overflow;document.body.style.overflow='hidden';
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
  document.addEventListener('keydown',escape);
  return()=>{document.body.style.overflow=before;document.removeEventListener('keydown',escape);};
 },[onClose]);
 const toggle=()=>{
  const video=ref.current;if(!video)return;
  if(video.paused)void video.play().catch(()=>setPlaying(false));
  else video.pause();
 };
 return createPortal(<div className="hn-chat-video-overlay" role="dialog"
  aria-modal="true" aria-label="Reproductor de video">
  <button type="button" className="hn-chat-video-close" onClick={onClose}
   aria-label="Cerrar video">×</button>
  {url?<div className="hn-chat-video-player">
    <video ref={ref} src={url} poster={poster||undefined}
     preload="metadata" playsInline controls={false}
     disablePictureInPicture disableRemotePlayback
     onLoadedMetadata={e=>setDuration(e.currentTarget.duration)}
     onDurationChange={e=>setDuration(e.currentTarget.duration)}
     onTimeUpdate={e=>setElapsed(e.currentTarget.currentTime)}
     onEnded={()=>setPlaying(false)} onPlay={()=>setPlaying(true)}
     onPause={()=>setPlaying(false)} onClick={toggle}/>
    <button type="button" className="hn-chat-video-center" onClick={toggle}
     aria-label={playing?'Pausar video':'Reproducir video'}>{playing?'Ⅱ':'▶'}</button>
    <div className="hn-chat-video-transport">
     <span>{durationLabel(elapsed)}</span>
     <input type="range" min={0} max={Math.max(1,duration)} step={.1}
      value={Math.min(elapsed,Math.max(1,duration))}
      aria-label="Posición del video" onChange={e=>{
       if(ref.current)ref.current.currentTime=Number(e.target.value);
       setElapsed(Number(e.target.value));
      }}/>
     <span>{durationLabel(duration)}</span>
    </div>
   </div>:<div className="hn-chat-video-wait" role={error?'alert':'status'}>
    {error?<><p>Video no disponible.</p>
     <button type="button" onClick={onRetry}>Reintentar</button></>:'Preparando video…'}
   </div>}
 </div>,document.body);
}
