import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {familyAlbumCount,getFamilyDirectory,getFamilyAlbumMedia,type FamilyDirectory,type FamilyAlbum,type FamilyMediaItem} from '@havana/shared';
import FamilyMediaGallery,{familyPrivateMediaUrl} from './FamilyMediaGallery';
import {useFamilyLive} from '../../services/use-family-live';
const MemberBook=lazy(()=>import('../book/MemberBook'));

function FamilyAlbumCard({album,onOpen}:{album:FamilyAlbum;onOpen:()=>void}){
 const cover=album.mediaReady?familyPrivateMediaUrl(album.coverUrl):null;
 return <button type="button" className="hn-family-album" onClick={onOpen}
  aria-label={'Abrir álbum de '+album.name}>
   <span className="hn-family-album-art" aria-hidden="true">
    {cover?<img className="hn-family-album-photo" src={cover} alt="" loading="lazy" decoding="async"/>:
     <span className="hn-family-monogram">{album.name.slice(0,1).toUpperCase()}</span>}
    <span className="hn-family-album-caption"><strong>{album.name}</strong>
     <small>{familyAlbumCount(album)}</small></span>
   </span>
 </button>;
}
export default function MemberFamily({token}:{token:string}){
 const [directory,setDirectory]=useState<FamilyDirectory|null>(null);
 const [selected,setSelected]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [items,setItems]=useState<FamilyMediaItem[]>([]);
 const [mediaLoading,setMediaLoading]=useState(false);
 const [mediaTick,setMediaTick]=useState(0);
 const seq=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++seq.current;
  try{const data=await getFamilyDirectory(token);
   if(id!==seq.current)return;
   setDirectory(data);setError('');
  }catch(e){if(id===seq.current)setError(e instanceof Error?e.message:'No se pudo abrir Familia HAVANA NICE.');}
  finally{if(id===seq.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setDirectory(null);setSelected(null);setLoading(true);
  void refresh();
  const resume=()=>{if(!document.hidden)void refresh();};
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{++seq.current;window.removeEventListener('online',resume);
   document.removeEventListener('visibilitychange',resume);};
 },[refresh]);
 useEffect(()=>{
  if(!selected||!directory?.mediaReady){setItems([]);setMediaLoading(false);return;}
  let cancelled=false;setItems([]);setMediaLoading(true);
  void getFamilyAlbumMedia(token,selected).then(next=>{
   if(!cancelled){setItems(next.items);setError('');}
  }).catch(e=>{
   if(!cancelled)setError(e instanceof Error?e.message:'No se pudo cargar el álbum.');
  }).finally(()=>{if(!cancelled)setMediaLoading(false);});
  return()=>{cancelled=true;};
 },[selected,token,directory?.mediaReady,mediaTick]);
 useFamilyLive(token,false,()=>{
  void refresh();
  setMediaTick(t=>t+1);
 });
 const album=directory?.albums.find(x=>x.actorId===selected);
 const cover=album?.mediaReady?familyPrivateMediaUrl(album.coverUrl):null;
 const readyItems=album?.mediaReady?items:undefined;
 const goBack=()=>setSelected(null);
 return <section className="hn-family hn-family-minimal" aria-label="Familia HAVANA NICE">
  {album&&<button type="button" className="hn-family-return" onClick={goBack}
    aria-label="Regresar a Familia HAVANA NICE">‹</button>}
  {error&&<p role="alert" className="hn-cal-error">{error}</p>}
  {loading?<p>Cargando integrantes autorizados…</p>:album?<>
   <div className="hn-family-cover">
    {cover?<img className="hn-family-cover-photo" src={cover} alt="" decoding="async"/>:
     <div className="hn-family-cover-placeholder" aria-hidden="true">{album.name.slice(0,1).toUpperCase()}</div>}
    <div className="hn-family-cover-text"><h2>{album.name}</h2>
     <p>{familyAlbumCount(album)}</p></div>
   </div>
   {mediaLoading?<p className="hn-family-empty">Cargando archivos privados…</p>:
    readyItems?.length?<FamilyMediaGallery items={readyItems}/>:
    <p className="hn-family-empty">{album.mediaReady?'Todavía no hay fotos ni videos en este álbum.':'El almacenamiento privado de Familia HAVANA NICE aún no está disponible.'}</p>}
  </>:<>
   {directory?.albums.length?<div className="hn-family-grid">
    {directory.albums.map(person=><FamilyAlbumCard key={person.actorId} album={person}
     onOpen={()=>setSelected(person.actorId)}/>)}
   </div>:<p className="hn-family-empty">No hay integrantes autorizados para mostrar.</p>}
   <div className="hn-family-inline-book" aria-label="Revista de Familia HAVANA NICE">
    <Suspense fallback={<p className="hn-family-empty" role="status">Abriendo revista…</p>}>
     <MemberBook token={token} tick={mediaTick}/>
    </Suspense>
   </div>
  </>}
 </section>;
}
