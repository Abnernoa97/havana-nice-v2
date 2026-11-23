// Fullscreen private photo/video gallery. The cached chat preview paints first,
// original decoding happens behind it, and nearby R2 grants are warmed privately.
import {useEffect,useRef,useState,type TouchEvent} from 'react';
import {createPortal} from 'react-dom';
import {requestChatMediaUrl,chatVideoPosterUrl} from './chat-media-grant';
import {peekChatPhotoPreview,loadChatPhotoPreview} from './chat-photo-thumbnail-cache';
import type {ChatMedia} from './chat-media-types';
import './chat-media-gallery.css';

const stamp=(n:number)=>{
 if(!Number.isFinite(n)||n<0)return '0:00';
 const sec=Math.floor(n);return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
};
function Frame({media,token,warmUrl}:{media:ChatMedia;token:string;warmUrl?:string|undefined}){
 const [url,setUrl]=useState(''),[cover,setCover]=useState('');
 const [loaded,setLoaded]=useState(false),[error,setError]=useState('');
 const [playing,setPlaying]=useState(false),[at,setAt]=useState(0),[duration,setDuration]=useState(0);
 const video=useRef<HTMLVideoElement|null>(null);
 useEffect(()=>{
  const abort=new AbortController();let live=true,objectUrl='';
  setUrl('');setCover('');setLoaded(false);setError('');
  const showPreview=(blob:Blob|null)=>{
   if(!live||!blob)return;
   objectUrl=URL.createObjectURL(blob);setCover(objectUrl);
  };
  const quick=peekChatPhotoPreview(token,media);
  if(quick)showPreview(quick);
  else void loadChatPhotoPreview(token,media).then(showPreview).catch(()=>{});
  void (async()=>{
   const signed=warmUrl||await requestChatMediaUrl(media.assetId,token,abort.signal);
   if(!live||abort.signal.aborted)return;
   setUrl(signed);
   if(media.kind==='photo'){
    // Do not swap the small cover for an undecoded full-size remote image.
    const image=new Image();
    image.onload=()=>{if(live)setLoaded(true);};
    image.onerror=()=>{if(live)setError('No se pudo visualizar el original.');};
    image.src=signed;
   }
  })().catch(()=>{if(live&&!abort.signal.aborted)setError('Archivo no disponible');});
  return()=>{
   live=false;abort.abort();
   if(objectUrl)URL.revokeObjectURL(objectUrl);
  };
 },[media.assetId,media.kind,media.sizeBytes,token,warmUrl]);
 const toggle=()=>{
  if(!video.current)return;
  if(video.current.paused)void video.current.play().catch(()=>setError('No se pudo reproducir este video.'));
  else video.current.pause();
 };
 if(media.kind==='photo'){
  const showing=loaded?url:cover;
  return <div className="hn-gallery-photo-surface">
   {showing?<img className="hn-gallery-image" src={showing} alt="Foto del chat" draggable={false}/>:
    <span className="hn-gallery-loading" role="status">{error||'Abriendo fotografía…'}</span>}
   {error&&cover&&<span className="hn-gallery-photo-hint">Vista previa disponible</span>}
  </div>;
 }
 const poster=cover||(url?chatVideoPosterUrl(url):'');
 return <div className="hn-gallery-video">
  {url?<video ref={video} src={url} preload="metadata" playsInline controls={false}
    poster={poster||undefined} disablePictureInPicture disableRemotePlayback
    onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
    onEnded={()=>setPlaying(false)}
    onLoadedMetadata={e=>setDuration(e.currentTarget.duration)}
    onTimeUpdate={e=>setAt(e.currentTarget.currentTime)}
    onError={()=>setError('Video no compatible o no disponible.')}
    onClick={toggle}/>:
    poster?<img className="hn-gallery-video-poster" src={poster} alt="Vista previa del video"/>:
    <span className="hn-gallery-loading" role="status">Preparando video…</span>}
  {error?<span className="hn-gallery-video-error" role="alert">{error}</span>:
   <button type="button" className="hn-gallery-play" onClick={toggle}
    aria-label={playing?'Pausar video':'Reproducir video'}>{playing?'Ⅱ':'▶'}</button>}
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
 const [,setRevision]=useState(0);
 const grants=useRef(new Map<string,{url:string;at:number}>());
 const start=useRef<{x:number;y:number}|null>(null);
 const turn=(delta:number)=>setIndex(i=>Math.max(0,Math.min(items.length-1,i+delta)));
 // Warming just the neighboring grant removes a round trip on the next swipe.
 // Signed URLs stay in this mounted viewer only and expire after eight minutes.
 useEffect(()=>{
  const abort=new AbortController();
  for(const pos of [index-1,index+1]){
   const media=items[pos];if(!media)continue;
   const prior=grants.current.get(media.assetId);
   if(prior&&Date.now()-prior.at<8*60*1000)continue;
   void requestChatMediaUrl(media.assetId,token,abort.signal).then(url=>{
    if(abort.signal.aborted)return;
    grants.current.set(media.assetId,{url,at:Date.now()});setRevision(n=>n+1);
   }).catch(()=>{});
  }
  return()=>abort.abort();
 },[index,items,token]);
 useEffect(()=>{
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape')onClose();
   else if(event.key==='ArrowLeft')turn(-1);
   else if(event.key==='ArrowRight')turn(1);
  };
  document.addEventListener('keydown',key);
  return()=>{document.body.style.overflow=previous;document.removeEventListener('keydown',key);};
 },[onClose,items.length]);
 const touchStart=(event:TouchEvent<HTMLDivElement>)=>{
  if((event.target as Element).closest?.('input')){start.current=null;return;}
  const t=event.touches[0];if(t)start.current={x:t.clientX,y:t.clientY};
 };
 const touchEnd=(event:TouchEvent<HTMLDivElement>)=>{
  const begin=start.current,t=event.changedTouches[0];start.current=null;
  if(!begin||!t)return;
  const dx=t.clientX-begin.x,dy=t.clientY-begin.y;
  if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.2)turn(dx<0?1:-1);
 };
 const item=items[index],warm=item&&grants.current.get(item.assetId);
 return createPortal(<div className="hn-gallery-overlay" role="dialog"
  aria-modal="true" aria-label="Galería de fotos y videos"
  onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={()=>{start.current=null;}}>
  <button type="button" className="hn-gallery-close" aria-label="Cerrar galería" onClick={onClose}>×</button>
  <span className="hn-gallery-count">{index+1}/{items.length}</span>
  {item&&<Frame key={item.assetId} media={item} token={token}
   warmUrl={warm&&Date.now()-warm.at<8*60*1000?warm.url:undefined}/>}
 </div>,document.body);
}
