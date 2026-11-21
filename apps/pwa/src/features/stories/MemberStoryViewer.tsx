import {useCallback,useEffect,useState} from 'react';
import {STORY_PLAYBACK_MS,type MemberStory} from '@havana/shared';
import StoryConversationPanel from './StoryConversationPanel';
import StoryReactionShower,{type StoryReactionBurst} from './StoryReactionShower';

type Props={items:MemberStory[];myId:string|undefined;token:string;refreshVersion:number;
 onClose:()=>void;onDelete:(id:string)=>Promise<boolean>;onPhotoError:(id:string)=>void};
export default function MemberStoryViewer({items,myId,token,refreshVersion,
 onClose,onDelete,onPhotoError}:Props){
 const [position,setPosition]=useState(0);
 const [deleting,setDeleting]=useState(false);
 const [failed,setFailed]=useState<string[]>([]);
 const [loadedUrl,setLoadedUrl]=useState('');
 const [held,setHeld]=useState(false);
 const [commentPaused,setCommentPaused]=useState(false);
 const [hidden,setHidden]=useState(typeof document!=='undefined'&&document.hidden);
 const [direction,setDirection]=useState<'next'|'previous'>('next');
 const [burst,setBurst]=useState<StoryReactionBurst|null>(null);
 const item=items[Math.min(position,items.length-1)];
 const failedPhoto=!!item&&failed.includes(item.photoUrl);
 const paused=deleting||held||hidden||commentPaused||(loadedUrl!==item?.photoUrl&&!failedPhoto);
 useEffect(()=>{
  const change=()=>setHidden(document.hidden);
  document.addEventListener('visibilitychange',change);
  return()=>document.removeEventListener('visibilitychange',change);
 },[]);
 useEffect(()=>{
  if(!item||item.expiresAt<=Date.now())onClose();
 },[item,onClose]);
 const previous=()=>{
  if(position===0)return;
  setDirection('previous');setPosition(p=>p-1);
 };
 const next=useCallback(()=>{
  if(position>=items.length-1){onClose();return;}
  setDirection('next');setPosition(p=>p+1);
 },[position,items.length,onClose]);
 const deleteCurrent=async()=>{
  if(deleting||!item)return;
  setDeleting(true);
  try{if(await onDelete(item.id)){
   if(items.length===1)onClose();
   else setPosition(p=>Math.min(p,items.length-2));
  }}finally{setDeleting(false);}
 };
 if(!item)return null;
 return <div className="hn-story-overlay" role="dialog" aria-modal="true"
  aria-label={'Estado de '+item.name} onKeyDown={event=>{
   if(event.key==='Escape')onClose();
   if(event.key==='ArrowRight')next();
   if(event.key==='ArrowLeft')previous();
  }}>
  <div className="hn-story-viewer">
   <div className="hn-story-progress" aria-label={(position+1)+' de '+items.length+' fotografías'}>
    {items.map((story,index)=><span key={story.id} className="hn-story-progress-track">
     {index<position?<span className="hn-story-progress-fill done"/>:
      index===position?<span key={item.id} className="hn-story-progress-fill playing"
       style={{animationDuration:STORY_PLAYBACK_MS+'ms',animationPlayState:paused?'paused':'running'}}
       onAnimationEnd={()=>{if(!paused)next();}}/>:null}
    </span>)}
   </div>
   <div className="hn-story-toolbar">
    <div><strong>{item.name}</strong><small>Estado · {position+1} de {items.length}</small></div>
    <div className="hn-story-toolbar-actions">
     {item.actorId===myId&&<button type="button" className="hn-story-delete"
      disabled={deleting} onClick={()=>void deleteCurrent()} aria-label="Eliminar mi estado">Eliminar</button>}
     <button type="button" aria-label="Cerrar estado" onClick={onClose}>×</button>
    </div>
   </div>
   <div key={item.id} className={'hn-story-image-stage '+(direction==='previous'?'page-previous':'page-next')}
    role="button" tabIndex={0} aria-label="Toca para pasar al siguiente estado"
    onPointerDown={()=>setHeld(true)} onPointerUp={()=>setHeld(false)}
    onPointerCancel={()=>setHeld(false)} onPointerLeave={()=>setHeld(false)}
    onClick={event=>{
     const rect=event.currentTarget.getBoundingClientRect();
     if(event.clientX-rect.left<rect.width*.33)previous();
     else next();
    }} onKeyDown={event=>{
     if(event.key==='Enter'||event.key===' '){event.preventDefault();next();}
    }}>
    {failedPhoto?<div className="hn-story-unavailable">No se pudo cargar esta fotografía.</div>:
     <img key={item.id+item.photoUrl} className="hn-story-image" src={item.photoUrl}
      alt={'Estado de '+item.name} onLoad={()=>setLoadedUrl(item.photoUrl)}
      onError={()=>{
       setFailed(prev=>prev.includes(item.photoUrl)?prev:[...prev,item.photoUrl]);
       onPhotoError(item.id);
      }}/>}
   </div>
   <StoryConversationPanel key={item.id} story={item} token={token}
    refreshVersion={refreshVersion} onPause={setCommentPaused} onBurst={setBurst}/>
   <div className="hn-story-step-controls">
    <button type="button" onClick={previous} disabled={position===0} aria-label="Estado anterior">‹</button>
    <button type="button" onClick={next}
     aria-label={position===items.length-1?'Cerrar estados':'Siguiente estado'}>›</button>
   </div>
  </div>
  <StoryReactionShower burst={burst}/>
 </div>;
}
