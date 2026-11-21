import {useCallback,useEffect,useState,type CSSProperties} from 'react';
import type {MemberStory} from '@havana/shared';
import StoryConversationPanel from './StoryConversationPanel';
import StoryReactionShower,{type StoryReactionBurst} from './StoryReactionShower';
import {useStoryPlayback} from './useStoryPlayback';
import {useStoryKeyboardViewport} from './useStoryKeyboardViewport';
import StoryPhotoSurface from './StoryPhotoSurface';

type Props={items:MemberStory[];myId:string|undefined;token:string;refreshVersion:number;
 onClose:()=>void;onDelete:(id:string)=>Promise<boolean>;onPhotoError:(id:string)=>void};

// ONE mounted photo; no 3D, transforms or animated image layers on iOS Safari.
// All controls overlay the canvas instead of pushing its dimensions down.
export default function MemberStoryViewer({items,myId,token,refreshVersion,
 onClose,onDelete,onPhotoError}:Props){
 const [position,setPosition]=useState(0);
 const [deleting,setDeleting]=useState(false);
 const [failed,setFailed]=useState<string[]>([]);
 const [loadedUrl,setLoadedUrl]=useState('');
 const [held,setHeld]=useState(false);
 const [commentPaused,setCommentPaused]=useState(false);
 const [hidden,setHidden]=useState(typeof document!=='undefined'&&document.hidden);
 const [burst,setBurst]=useState<StoryReactionBurst|null>(null);
 const viewport=useStoryKeyboardViewport();
 const item=items[Math.min(position,items.length-1)];
 const failedPhoto=!!item&&failed.includes(item.photoUrl);
 const paused=deleting||held||hidden||commentPaused||(loadedUrl!==item?.photoUrl&&!failedPhoto);
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
 // Load outside the DOM: only ONE CSS background is mounted. Avoids Safari's
 // accumulated WebKit image layers and keeps playback paused until loaded.
 useEffect(()=>{
  if(!item)return;
  let active=true;
  const loader=new Image();
  const url=item.photoUrl,id=item.id;
  loader.onload=()=>{if(active)setLoadedUrl(url);};
  loader.onerror=()=>{
   if(!active)return;
   setFailed(prev=>prev.includes(url)?prev:[...prev,url]);
   onPhotoError(id);
  };
  loader.src=url;
  return()=>{active=false;loader.onload=null;loader.onerror=null;};
 },[item?.id,item?.photoUrl,onPhotoError]);
 const previous=()=>{
  if(position>0){setLoadedUrl('');setPosition(p=>p-1);}
 };
 const next=useCallback(()=>{
  if(position>=items.length-1){onClose();return;}
  setLoadedUrl('');setPosition(p=>p+1);
 },[position,items.length,onClose]);
 const progress=useStoryPlayback(item?.id,paused,next);
 const deleteCurrent=async()=>{
  if(deleting||!item)return;
  setDeleting(true);
  try{
   if(await onDelete(item.id)){
    if(items.length===1)onClose();
    else {setLoadedUrl('');setPosition(p=>Math.min(p,items.length-2));}
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
    url={item.photoUrl} failed={failedPhoto}/>
   <div className="hn-story-progress" role="progressbar" aria-label="Avance del estado"
    aria-valuemin={0} aria-valuemax={items.length*100} aria-valuenow={position*100+Math.round(progress)}>
    {items.map((story,index)=><span key={story.id} className="hn-story-progress-track">
     <span className="hn-story-progress-fill"
      style={{width:(index<position?100:index===position?progress:0)+'%'}}/>
    </span>)}
   </div>
   <div className="hn-story-toolbar">
    <div><strong>{item.name}</strong><small>Estado · {position+1} de {items.length}</small></div>
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
   <StoryConversationPanel key={item.id} story={item} token={token}
    refreshVersion={refreshVersion} onPause={setCommentPaused} onBurst={setBurst}/>
  </div>
  <StoryReactionShower burst={burst}/>
 </div>;
}
