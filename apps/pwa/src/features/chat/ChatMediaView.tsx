import {useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
export type ChatMedia={assetId:string;kind:'photo'|'video';mimeType:string;sizeBytes:number;name:string};

const signedPath=(id:string)=>API+'/api/chat/media/'+id+'/grant';

/** One media view shared by musician PWA and Admin.
 * Preview photos use a COMPLETE downloaded Blob, never an unfinished progressive
 * image. The same object URL opens the full-screen image immediately.
 * Only on-screen photos download; unmount revokes local memory.
 */
export default function ChatMediaView({media,token}:{media:ChatMedia;token:string}){
 const surface=useRef<HTMLDivElement|null>(null);
 const [signed,setSigned]=useState('');
 const [ready,setReady]=useState('');
 const [visible,setVisible]=useState(false);
 const [enlarged,setEnlarged]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  const current=surface.current;
  if(!current)return;
  if(!('IntersectionObserver' in window)){setVisible(true);return;}
  const observer=new IntersectionObserver(items=>{
   if(items.some(item=>item.isIntersecting))setVisible(true);
  },{rootMargin:'320px'});
  observer.observe(current);return()=>observer.disconnect();
 },[media.assetId]);
 useEffect(()=>{
  if(!visible)return;
  let active=true;
  const controller=new AbortController();
  let objectUrl='';
  setSigned('');setReady('');setError('');
  void (async()=>{
   const reply=await fetch(signedPath(media.assetId),{
     headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal
   });
   if(!reply.ok)throw Error('Archivo no disponible');
   const grant=await reply.json() as {url?:string};
   if(!grant.url?.startsWith(API+'/api/chat/media/'))throw Error('Archivo no disponible');
   if(!active)return;
   setSigned(grant.url);
   if(media.kind==='video')return;
   // Fetch original ahead of the tap; a Blob is displayed only once complete.
   const image=await fetch(grant.url,{cache:'no-store',signal:controller.signal});
   if(!image.ok)throw Error('Fotografía no disponible');
   const blob=await image.blob();
   if(!active)return;
   if(blob.type&&!blob.type.startsWith('image/'))throw Error('Formato no disponible');
   objectUrl=URL.createObjectURL(blob);
   setReady(objectUrl);
  })().catch(()=>{if(active)setError('No se pudo cargar el archivo');});
  return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[media.assetId,media.kind,token,visible]);
 const close=useCallback(()=>setEnlarged(false),[]);
 useEffect(()=>{
  if(!enlarged)return;
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close();};
  document.addEventListener('keydown',key);
  return()=>document.removeEventListener('keydown',key);
 },[enlarged,close]);
 return <>
  <div ref={surface} className="hn-chat-media">
   {media.kind==='photo'?
     ready?
      <button type="button" className="hn-chat-image-button" onClick={()=>setEnlarged(true)}
       aria-label="Ampliar fotografía">
       <img src={ready} alt="Fotografía enviada" decoding="async" className="hn-chat-photo"/>
      </button>
      :<div className="hn-media-loading" role="status">{error||'Cargando…'}</div>
     :signed?
       <video key={signed} src={signed} playsInline controls preload="metadata"
        className="hn-chat-video" aria-label="Reproducir video enviado"/>
       :<div className="hn-media-loading" role="status">{error||'Cargando…'}</div>}
  </div>
  {enlarged&&ready&&createPortal(
   <div className="hn-photo-overlay" role="dialog" aria-modal="true" aria-label="Fotografía ampliada"
    onClick={close}>
    <button type="button" className="hn-photo-close" aria-label="Cerrar fotografía" onClick={close}>×</button>
    <img src={ready} alt="Fotografía ampliada" className="hn-photo-full"
      onClick={event=>event.stopPropagation()}/>
   </div>,document.body)}
 </>;
}
