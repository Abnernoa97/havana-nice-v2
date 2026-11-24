// Fullscreen private photo/video gallery. The cached chat preview paints first,
// original decoding happens behind it, and nearby R2 grants are warmed privately.
import {useEffect,useRef,useState,type TouchEvent} from 'react';
import {createPortal} from 'react-dom';
import {requestChatMediaUrl,chatVideoPosterUrl} from './chat-media-grant';
import {keepChatGrantsForToken,type ChatGalleryGrantScope} from './chat-gallery-grant-scope';
import {peekChatPhotoPreview,loadChatPhotoPreview} from './chat-photo-thumbnail-cache';
import type {ChatMedia} from './chat-media-types';
import './chat-media-gallery.css';

function Frame({media,token,warmUrl}:{media:ChatMedia;token:string;warmUrl?:string|undefined}){
 const [url,setUrl]=useState(''),[cover,setCover]=useState('');
 const [loaded,setLoaded]=useState(false),[error,setError]=useState('');
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
  {url?<video key={url} src={url} preload="metadata" playsInline controls
    poster={poster||undefined} className="hn-gallery-video-native"
    onError={()=>setError('Este video no puede reproducirse en Safari con su formato actual.')}/>:
    poster?<img className="hn-gallery-video-poster" src={poster} alt="Vista previa del video"/>:
    <span className="hn-gallery-loading" role="status">Preparando video…</span>}
  {error&&<span className="hn-gallery-video-error" role="alert">{error}</span>}
 </div>;
}
export default function ChatMediaGallery({items,initial,token,onClose}:{
 items:ChatMedia[];initial:number;token:string;onClose:()=>void;
}){
 const [index,setIndex]=useState(initial);
 const [,setRevision]=useState(0);
 const grants=useRef<ChatGalleryGrantScope>({owner:token,entries:new Map()});
 keepChatGrantsForToken(grants.current,token);
 const start=useRef<{x:number;y:number}|null>(null);
 const turn=(delta:number)=>setIndex(i=>Math.max(0,Math.min(items.length-1,i+delta)));
 // Warming just the neighboring grant removes a round trip on the next swipe.
 // Signed URLs stay in this mounted viewer only and expire after eight minutes.
 useEffect(()=>{
  const abort=new AbortController();
  for(const pos of [index-1,index+1]){
   const media=items[pos];if(!media)continue;
   const prior=grants.current.entries.get(media.assetId);
   if(prior&&Date.now()-prior.at<8*60*1000)continue;
   void requestChatMediaUrl(media.assetId,token,abort.signal).then(url=>{
    if(abort.signal.aborted||grants.current.owner!==token)return;
    grants.current.entries.set(media.assetId,{url,at:Date.now()});setRevision(n=>n+1);
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
  if((event.target as Element).closest?.('input,video')){start.current=null;return;}
  const t=event.touches[0];if(t)start.current={x:t.clientX,y:t.clientY};
 };
 const touchEnd=(event:TouchEvent<HTMLDivElement>)=>{
  const begin=start.current,t=event.changedTouches[0];start.current=null;
  if(!begin||!t)return;
  const dx=t.clientX-begin.x,dy=t.clientY-begin.y;
  if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.2)turn(dx<0?1:-1);
 };
 const item=items[index],warm=item&&grants.current.entries.get(item.assetId);
 return createPortal(<div className="hn-gallery-overlay" role="dialog"
  aria-modal="true" aria-label="Galería de fotos y videos"
  onTouchStart={touchStart} onTouchEnd={touchEnd} onTouchCancel={()=>{start.current=null;}}>
  <button type="button" className="hn-gallery-close" aria-label="Cerrar galería" onClick={onClose}>×</button>
  <span className="hn-gallery-count">{index+1}/{items.length}</span>
  {item&&<Frame key={item.assetId} media={item} token={token}
   warmUrl={warm&&Date.now()-warm.at<8*60*1000?warm.url:undefined}/>}
 </div>,document.body);
}
