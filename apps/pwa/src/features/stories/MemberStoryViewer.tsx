import {useCallback,useEffect,useState,type CSSProperties} from 'react';
import type {MemberStory} from '@havana/shared';
import StoryConversationPanel from './StoryConversationPanel';
import StoryReactionShower,{type StoryReactionBurst} from './StoryReactionShower';
import {useStoryPlayback} from './useStoryPlayback';
import {useStoryKeyboardViewport} from './useStoryKeyboardViewport';
import StoryPhotoSurface from './StoryPhotoSurface';
import StoryDiagnostics from './StoryDiagnostics';
import {useStoryPhotoCache} from './useStoryPhotoCache';
import {warmStoryPhoto} from './story-photo-pool';

type Props={items:MemberStory[];myId:string|undefined;token:string;refreshVersion:number;
 onClose:()=>void;onDelete:(id:string)=>Promise<boolean>;onPhotoError:(id:string)=>void;
 onViewed:(id:string)=>void};

// ONE mounted photo; no 3D, transforms or animated image layers on iOS Safari.
// All controls overlay the canvas instead of pushing its dimensions down.
export default function MemberStoryViewer({items,myId,token,refreshVersion,
 onClose,onDelete,onPhotoError,onViewed}:Props){
 const [requestedPosition,setPosition]=useState(0);
 const position=Math.min(requestedPosition,Math.max(0,items.length-1));
 useEffect(()=>{if(position!==requestedPosition)setPosition(position);},[position,requestedPosition]);
 const [deleting,setDeleting]=useState(false);
 const [diagnostics,setDiagnostics]=useState(false);
 const [held,setHeld]=useState(false);
 const [commentPaused,setCommentPaused]=useState(false);
 const [hidden,setHidden]=useState(typeof document!=='undefined'&&document.hidden);
 const [burst,setBurst]=useState<StoryReactionBurst|null>(null);
 const viewport=useStoryKeyboardViewport();
 const item=items[Math.min(position,items.length-1)];
 const photo=useStoryPhotoCache(items,position);
 const [loadedKey,setLoadedKey]=useState('');
 const [failedKey,setFailedKey]=useState('');
 const sourceKey=item?item.id+':'+photo.url:'';
 const isReady=loadedKey===sourceKey;
 const failedPhoto=failedKey===sourceKey;
 const currentId=item?.id;
 const photoLoaded=useCallback((id:string,url:string)=>setLoadedKey(id+':'+url),[]);
 const photoFailed=useCallback((id:string,url:string)=>{
  // A damaged or reclaimed local Blob never hides a valid remote JPEG.
  if(photo.fallbackToRemote(id,url))return;
  setFailedKey(id+':'+url);onPhotoError(id);
 },[photo.fallbackToRemote,onPhotoError]);
 // A stalled request must become recoverable, not leave an infinite spinner.
 useEffect(()=>{
  if(!currentId||!photo.url||isReady||failedPhoto||hidden)return;
  const timer=setTimeout(()=>photoFailed(currentId,photo.url),8000);
  return()=>clearTimeout(timer);
 },[currentId,photo.url,isReady,failedPhoto,hidden,photoFailed]);
 // Count each photo as viewed only once its private bitmap is ready to show.
 useEffect(()=>{
  if(item&&isReady)onViewed(item.id);
 },[item?.id,isReady,onViewed]);
 // Optional persistence begins only after the current photo is visible.
 useEffect(()=>{
  if(!item||!isReady||photo.url.startsWith('blob:'))return;
  const timer=setTimeout(()=>{void warmStoryPhoto(item);},350);
  return()=>clearTimeout(timer);
 },[item?.id,item?.photoUrl,isReady,photo.url]);
 const paused=diagnostics||deleting||held||hidden||commentPaused||(!isReady&&!failedPhoto);
 useEffect(()=>{
  const change=()=>setHidden(document.hidden);
  document.addEventListener('visibilitychange',change);
  return()=>document.removeEventListener('visibilitychange',change);
 },[]);
 useEffect(()=>{if(!item||item.expiresAt<=Date.now())onClose();},[item,onClose]);
 useEffect(()=>{
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=previous;};
 },[]);
 // Current image uses a direct authorized URL or a valid warm Blob.
 const previous=()=>{
  if(position>0)setPosition(p=>p-1);
 };
 const next=useCallback(()=>{
  if(position>=items.length-1){onClose();return;}
  setPosition(p=>p+1);
 },[position,items.length,onClose]);
 const progress=useStoryPlayback(item?.id,paused,next);
 const deleteCurrent=async()=>{
  if(deleting||!item)return;
  setDeleting(true);
  try{
   if(await onDelete(item.id)){
    if(items.length===1)onClose();
    else setPosition(p=>Math.min(p,items.length-2));
   }
  }finally{setDeleting(false);}
 };
 if(!item)return null;
 return <div className="hn-story-overlay" role="dialog" aria-modal="true"
  aria-label={'Estado de '+item.name} onKeyDown={event=>{
   const typing=(event.target as HTMLElement).closest('input,textarea,button,audio');
   if(event.key==='Escape')onClose();
   if(!typing&&event.key==='ArrowRight')next();
   if(!typing&&event.key==='ArrowLeft')previous();
  }}>
  <div className="hn-story-viewer" style={{
   '--hn-story-fixed-height':viewport.fixedHeight+'px',
   '--hn-story-keyboard-inset':viewport.keyboardInset+'px'
  } as CSSProperties}>
   <StoryPhotoSurface id={item.id} name={item.name}
    url={photo.url} failed={failedPhoto} loaded={isReady}
    onReady={photoLoaded} onError={photoFailed}/>
   <div className="hn-story-progress" role="progressbar" aria-label="Avance del estado"
    aria-valuemin={0} aria-valuemax={items.length*100} aria-valuenow={position*100+Math.round(progress)}>
    {items.map((story,index)=><span key={story.id} className="hn-story-progress-track">
     <span className="hn-story-progress-fill"
      style={{width:(index<position?100:index===position?progress:0)+'%'}}/>
    </span>)}
   </div>
   <div className="hn-story-toolbar">
    <div><strong>{item.name}</strong><small><button type="button" onClick={()=>setDiagnostics(v=>!v)}
     aria-label="Abrir diagnóstico local de rendimiento" style={{border:0,padding:0,background:'transparent',color:'inherit',font:'inherit',textAlign:'left'}}>
     Estado · {position+1} de {items.length}</button></small></div>
    <div className="hn-story-toolbar-actions">
     {item.actorId===myId&&<button type="button" className="hn-story-delete"
      disabled={deleting} onClick={()=>void deleteCurrent()} aria-label="Eliminar mi estado">Eliminar</button>}
     <button type="button" aria-label="Cerrar estado" className="hn-story-close" onClick={onClose}>×</button>
    </div>
   </div>
   <div className="hn-story-tap-zones" aria-hidden="false">
    <button type="button" className="hn-story-tap-prev" aria-label="Estado anterior"
     disabled={position===0} onClick={previous}
     onPointerDown={()=>setHeld(true)} onPointerUp={()=>setHeld(false)}
     onPointerCancel={()=>setHeld(false)} onPointerLeave={()=>setHeld(false)}/>
    <button type="button" className="hn-story-tap-next"
     aria-label={position===items.length-1?'Cerrar estados':'Siguiente estado'} onClick={next}
     onPointerDown={()=>setHeld(true)} onPointerUp={()=>setHeld(false)}
     onPointerCancel={()=>setHeld(false)} onPointerLeave={()=>setHeld(false)}/>
   </div>
   <StoryDiagnostics open={diagnostics} source={photo.url} ready={isReady} failed={failedPhoto} onClose={()=>setDiagnostics(false)}/>
   <StoryConversationPanel key={item.id} story={item} token={token} myId={myId}
    refreshVersion={refreshVersion} onPause={setCommentPaused} onBurst={setBurst}/>
  </div>
  <StoryReactionShower burst={burst}/>
 </div>;
}
