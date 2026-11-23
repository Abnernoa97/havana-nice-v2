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
    {cover?<img className="hn-family-album-photo" src={cover} alt="" loading="eager" decoding="async"/>:
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
 const [itemsActor,setItemsActor]=useState<string|null>(null);
 const [mediaLoading,setMediaLoading]=useState(false);
 const [mediaTick,setMediaTick]=useState(0);
 const seq=useRef(0);
 // Private 10-minute grants: reuse only for a bounded interval in this
 // signed-in component. No indexedDB, CacheStorage, or persistent R2 URLs.
 const albumCache=useRef(new Map<string,{items:FamilyMediaItem[];at:number}>());
 const albumCacheOwner=useRef(token);
 const cacheEpoch=useRef(0);
 const albumInflight=useRef(new Map<string,Promise<FamilyMediaItem[]>>());
 const loadCached=useCallback((actorId:string)=>{
  const cached=albumCache.current.get(actorId);
  if(cached&&Date.now()-cached.at<4*60_000)return Promise.resolve(cached.items);
  const pending=albumInflight.current.get(actorId);
  if(pending)return pending;
  const epoch=cacheEpoch.current;
  const job=getFamilyAlbumMedia(token,actorId).then(data=>{
   if(albumCacheOwner.current===token&&cacheEpoch.current===epoch)
    albumCache.current.set(actorId,{items:data.items,at:Date.now()});
   return data.items;
  }).finally(()=>albumInflight.current.delete(actorId));
  albumInflight.current.set(actorId,job);
  return job;
 },[token]);
 const refresh=useCallback(async()=>{
  const id=++seq.current;
  try{const data=await getFamilyDirectory(token);
   if(id!==seq.current)return;
   setDirectory(data);setError('');
  }catch(e){if(id===seq.current)setError(e instanceof Error?e.message:'No se pudo abrir Familia HAVANA NICE.');}
  finally{if(id===seq.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  albumCacheOwner.current=token;cacheEpoch.current++;
  albumCache.current.clear();albumInflight.current.clear();
  setDirectory(null);setSelected(null);setLoading(true);
  void refresh();
  const resume=()=>{if(!document.hidden)void refresh();};
  window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{++seq.current;window.removeEventListener('online',resume);
   document.removeEventListener('visibilitychange',resume);};
 },[refresh]);
 useEffect(()=>{
  if(!directory?.mediaReady)return;
  // Warm tiny metadata for visible albums so entering an album is immediate.
  // Media remains private: no files or capabilities are stored persistently.
  for(const item of directory.albums.slice(0,5)){
   void loadCached(item.actorId).catch(()=>{});
  }
 },[directory,loadCached]);
 useEffect(()=>{
  if(!selected||!directory?.mediaReady){
   setItems([]);setItemsActor(null);setMediaLoading(false);return;
  }
  let cancelled=false;
  const cached=albumCache.current.get(selected);
  const recent=!!cached&&Date.now()-cached.at<4*60_000;
  if(recent){setItems(cached.items);setItemsActor(selected);setMediaLoading(false);}
  else setMediaLoading(true);
  // A live update replaces the data only after a successful response.
  // Never blank out thumbnails during realtime reactions/album changes.
  void loadCached(selected).then(next=>{
   if(!cancelled){setItems(next);setItemsActor(selected);setError('');}
  }).catch(e=>{
   if(!cancelled)setError(e instanceof Error?e.message:'No se pudo cargar el álbum.');
  }).finally(()=>{if(!cancelled)setMediaLoading(false);});
  return()=>{cancelled=true;};
 },[selected,token,directory?.mediaReady,mediaTick,loadCached]);
 useFamilyLive(token,false,()=>{
  // Signed metadata becomes stale only on a server-side family update;
  // retain the currently rendered thumbnails until fresh data arrives.
  cacheEpoch.current++;
  albumCache.current.clear();albumInflight.current.clear();
  void refresh();
  setMediaTick(t=>t+1);
 });
 const album=directory?.albums.find(x=>x.actorId===selected);
 const cover=album?.mediaReady?familyPrivateMediaUrl(album.coverUrl):null;
 const readyItems=album?.mediaReady&&itemsActor===selected?items:undefined;
 const goBack=()=>setSelected(null);
 return <section className="hn-family hn-family-minimal" aria-label="Familia HAVANA NICE">
  {album&&<button type="button" className="hn-family-return" onClick={goBack}
    aria-label="Regresar a Familia HAVANA NICE">‹</button>}
  {error&&<p role="alert" className="hn-cal-error">{error}</p>}
  {loading?<p>Cargando integrantes autorizados…</p>:album?<>
   <div className="hn-family-cover">
    {cover?<img className="hn-family-cover-photo" src={cover} alt="" loading="eager" decoding="async"/>:
     <div className="hn-family-cover-placeholder" aria-hidden="true">{album.name.slice(0,1).toUpperCase()}</div>}
    <div className="hn-family-cover-text"><h2>{album.name}</h2>
     <p>{familyAlbumCount(album)}</p></div>
   </div>
   {mediaLoading&&!readyItems?.length?<p className="hn-family-empty">Cargando archivos privados…</p>:
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
