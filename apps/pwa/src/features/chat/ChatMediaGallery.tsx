// Fullscreen swipe gallery. Every photo/video of a consecutive album is one sequence.
// Audio is a separate message type; never opened here.
import {useEffect,useRef,useState,type TouchEvent} from 'react';
import {createPortal} from 'react-dom';
import {requestChatMediaUrl} from './chat-media-grant';
import type {ChatMedia} from './chat-media-types';

function stamp(seconds:number){
 if(!Number.isFinite(seconds)||seconds<0)return '0:00';
 const s=Math.floor(seconds);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
}
function Frame({media,token}:{media:ChatMedia;token:string}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 const [playing,setPlaying]=useState(false),[at,setAt]=useState(0),[duration,setDuration]=useState(0);
 const video=useRef<HTMLVideoElement|null>(null);
 useEffect(()=>{
  const abort=new AbortController();let live=true;
  void requestChatMediaUrl(media.assetId,token,abort.signal)
   .then(url=>{if(live)setUrl(url);})
   .catch(()=>{if(live&&!abort.signal.aborted)setError('No se pudo abrir el archivo');});
  return()=>{live=false;abort.abort();};
 },[media.assetId,token]);
 const toggle=()=>{
  if(!video.current)return;
  if(video.current.paused)void video.current.play().catch(()=>setPlaying(false));
  else video.current.pause();
 };
 if(error)return <p role="alert" className="hn-gallery-loading">{error}</p>;
 if(!url)return <span role="status" className="hn-gallery-loading">Abriendo…</span>;
 if(media.kind==='photo')return <img className="hn-gallery-image" src={url} alt="Foto del chat" draggable={false}/>;
 return <div className="hn-gallery-video">
   <video ref={video} src={url} preload="metadata" playsInline controls={false}
     disableRemotePlayback disablePictureInPicture
     onClick={toggle} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
     onEnded={()=>setPlaying(false)}
     onLoadedMetadata={e=>setDuration(e.currentTarget.duration)}
     onTimeUpdate={e=>setAt(e.currentTarget.currentTime)}/>
   <button type="button" className="hn-gallery-play" onClick={toggle}
     aria-label={playing?'Pausar video':'Reproducir video'}>{playing?'Ⅱ':'▶'}</button>
   <div className="hn-gallery-progress">
    <span>{stamp(at)}</span>
    <input type="range" min={0} max={Math.max(1,duration)} step=".1"
     value={Math.min(at,Math.max(1,duration))} aria-label="Posición del video"
     onChange={e=>{if(video.current)video.current.currentTime=Number(e.target.value);setAt(Number(e.target.value));}}/>
    <span>{stamp(duration)}</span>
   </div>
 </div>;
}
export default function ChatMediaGallery({items,initial,token,onClose}:{
 items:ChatMedia[];initial:number;token:string;onClose:()=>void;
}){
 const [index,setIndex]=useState(initial);
 const start=useRef<{x:number;y:number}|null>(null);
 const turn=(delta:number)=>setIndex(i=>Math.max(0,Math.min(items.length-1,i+delta)));
 useEffect(()=>{
  const prior=document.body.style.overflow;document.body.style.overflow='hidden';
  const keys=(event:KeyboardEvent)=>{
   if(event.key==='Escape')onClose();
   else if(event.key==='ArrowLeft')turn(-1);
   else if(event.key==='ArrowRight')turn(1);
  };
  document.addEventListener('keydown',keys);
  return()=>{document.body.style.overflow=prior;document.removeEventListener('keydown',keys);};
 },[onClose,items.length]);
 const begin=(e:TouchEvent<HTMLDivElement>)=>{
  const t=e.touches[0];if(t)start.current={x:t.clientX,y:t.clientY};
 };
 const finish=(e:TouchEvent<HTMLDivElement>)=>{
  const before=start.current,t=e.changedTouches[0];start.current=null;
  if(!before||!t)return;
  const dx=t.clientX-before.x,dy=t.clientY-before.y;
  if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.2)turn(dx<0?1:-1);
 };
 const item=items[index];
 return createPortal(<div className="hn-gallery-overlay" role="dialog"
  aria-modal="true" aria-label="Fotos y videos"
  onTouchStart={begin} onTouchEnd={finish} onTouchCancel={()=>{start.current=null;}}>
  <button type="button" className="hn-gallery-close" aria-label="Cerrar galería" onClick={onClose}>×</button>
  <span className="hn-gallery-count">{index+1}/{items.length}</span>
  {item&&<Frame key={item.assetId} media={item} token={token}/>}

 </div>,document.body);
}
