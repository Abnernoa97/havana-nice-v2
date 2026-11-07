import {useEffect,useRef,useState,type KeyboardEvent} from 'react';
import {HAVANA_V2_DEV_API_BASE_URL,type FamilyMediaItem} from '@havana/shared';
import '../../styles/family/gallery.css';

// Private files must be granted by the existing Worker, never loaded from external hosts.
export function familyPrivateMediaUrl(value:string|null|undefined):string|null{
 if(!value)return null;
 try{
  const base=new URL(HAVANA_V2_DEV_API_BASE_URL);
  const url=new URL(value,base);
  if(url.protocol!=='https:'||url.origin!==base.origin||
   !url.pathname.startsWith('/api/family/media/'))return null;
  return url.href;
 }catch{return null;}
}

type ReadyItem={id:string;kind:'photo'|'video';thumbnail:string|null;file:string;alt:string};

export default function FamilyMediaGallery({items,onDelete,onSetCover,onMakePoster}:{items:readonly FamilyMediaItem[];onDelete?:(id:string)=>Promise<void>;onSetCover?:(id:string)=>Promise<void>;onMakePoster?:(id:string,sourceUrl:string)=>Promise<void>}){
 const validItems:ReadyItem[]=items.flatMap(item=>{
  const file=familyPrivateMediaUrl(item.fileUrl);
  if(!file||!item.id||!['photo','video'].includes(item.kind))return [];
  return [{
   id:item.id,kind:item.kind,thumbnail:familyPrivateMediaUrl(item.thumbnailUrl),
   file,alt:item.alt|| (item.kind==='video'?'Video del álbum':'Foto del álbum')
  }];
 });
 const [active,setActive]=useState<number|null>(null);
 const modal=useRef<HTMLDialogElement|null>(null);
 useEffect(()=>{
  const dialog=modal.current;
  if(!dialog)return;
  if(active!==null){if(!dialog.open)dialog.showModal();}
  else if(dialog.open)dialog.close();
 },[active]);
 useEffect(()=>{
  if(active!==null&&active>=validItems.length)setActive(null);
 },[active,validItems.length]);
 if(!validItems.length)return null;
 const current=active!==null?validItems[active]:undefined;
 const advance=(step:number)=>{
  setActive(index=>index===null?null:(index+step+validItems.length)%validItems.length);
 };
 const handleKeys=(event:KeyboardEvent<HTMLDialogElement>)=>{
  if(event.key==='ArrowRight'){event.preventDefault();advance(1);}
  if(event.key==='ArrowLeft'){event.preventDefault();advance(-1);}
 };
 return <div className="hn-family-media-gallery" aria-label="Archivos del álbum">
  <div className="hn-family-media-grid">
   {validItems.map((item,index)=><button type="button" key={item.id}
    className="hn-family-media-thumb" onClick={()=>setActive(index)}
    aria-label={'Abrir '+item.alt+', '+(index+1)+' de '+validItems.length}>
    {item.thumbnail?<img src={item.thumbnail} alt="" loading="lazy" decoding="async"/>:
     <span className="hn-family-media-video-fallback" aria-hidden="true">{item.kind==='video'?'▶':'◻'}</span>}
    {item.kind==='video'&&<span className="hn-family-media-play-marker" aria-hidden="true">▶</span>}
   </button>)}
  </div>
  <dialog ref={modal} className="hn-family-media-dialog" aria-label="Visor del álbum"
   onClose={()=>setActive(null)} onCancel={()=>setActive(null)} onKeyDown={handleKeys}>
   {current&&<>
    <div className="hn-family-media-dialog-bar">
     <span>{active!+1} / {validItems.length}</span>
     <div className="hn-family-media-dialog-tools">
      {onSetCover&&current.kind==='photo'?<button type="button" className="hn-family-media-action"
       onClick={()=>{setActive(null);void onSetCover(current.id);}}>Portada</button>:null}
      {onMakePoster&&current.kind==='video'&&!current.thumbnail?
       <button type="button" className="hn-family-media-action"
        onClick={()=>{setActive(null);void onMakePoster(current.id,current.file);}}>Crear miniatura</button>:null}
      {onDelete?<button type="button" className="hn-family-media-action"
       onClick={()=>{
        if(!window.confirm('¿Eliminar definitivamente este archivo del álbum?'))return;
        setActive(null);void onDelete(current.id);
       }}>Eliminar</button>:null}
      <button type="button" onClick={()=>setActive(null)} aria-label="Cerrar visor">✕</button>
     </div>
    </div>
    <div className="hn-family-media-stage" key={current.id}>
     {current.kind==='photo'?<img src={current.file} alt={current.alt} decoding="async"/>:
      <video src={current.file} poster={current.thumbnail||undefined} controls playsInline preload="metadata" aria-label={current.alt}/>}
    </div>
    <div className="hn-family-media-dialog-nav">
     <button type="button" onClick={()=>advance(-1)} aria-label="Archivo anterior">‹</button>
     <span>{current.alt}</span>
     <button type="button" onClick={()=>advance(1)} aria-label="Archivo siguiente">›</button>
    </div>
   </>}
  </dialog>
 </div>;
}
