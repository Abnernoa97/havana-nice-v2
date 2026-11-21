import {useEffect,useState} from 'react';
import type {MemberStory} from '@havana/shared';

type Props={items:MemberStory[];myId:string|undefined;
 onClose:()=>void;onDelete:(id:string)=>Promise<boolean>;onPhotoError:(id:string)=>void};
export default function MemberStoryViewer({items,myId,onClose,onDelete,onPhotoError}:Props){
 const [position,setPosition]=useState(0);
 const [deleting,setDeleting]=useState(false);
 const [failed,setFailed]=useState<string[]>([]);
 const item=items[Math.min(position,items.length-1)];
 useEffect(()=>{
  if(!item||item.expiresAt<=Date.now())onClose();
 },[item,onClose]);
 if(!item)return null;
 const previous=()=>setPosition(Math.max(0,position-1));
 const next=()=>position>=items.length-1?onClose():setPosition(position+1);
 const deleteCurrent=async()=>{
  if(deleting)return;
  setDeleting(true);
  try{if(await onDelete(item.id)){
   if(items.length===1)onClose();
   else setPosition(Math.max(0,Math.min(position,items.length-2)));
  }}finally{setDeleting(false);}
 };
 return <div className="hn-story-overlay" role="dialog" aria-modal="true" aria-label={'Estado de '+item.name}>
  <div className="hn-story-viewer">
   <div className="hn-story-progress" aria-label={(position+1)+' de '+items.length}>
    {items.map((story,index)=><span key={story.id} className={index<=position?'completed':''}/>)}
   </div>
   <div className="hn-story-toolbar">
    <div><strong>{item.name}</strong><small>Estado · 24 horas</small></div>
    <button type="button" aria-label="Cerrar estado" onClick={onClose}>×</button>
   </div>
   {failed.includes(item.photoUrl)?
    <div className="hn-story-unavailable">No se pudo cargar esta fotografía.</div>:
    <img key={item.photoUrl} className="hn-story-image" src={item.photoUrl} alt={'Estado de '+item.name}
     onError={()=>{
      setFailed(prev=>[...prev,item.photoUrl]);
      onPhotoError(item.id);
     }}/>}
   <div className="hn-story-controls">
    <button type="button" onClick={previous} disabled={position===0} aria-label="Estado anterior">‹</button>
    {item.actorId===myId&&<button type="button" disabled={deleting} className="hn-story-delete"
     onClick={()=>void deleteCurrent()}>Eliminar mi estado</button>}
    <button type="button" onClick={next} aria-label={position===items.length-1?'Cerrar estados':'Siguiente estado'}>›</button>
   </div>
  </div>
 </div>;
}
