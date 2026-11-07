import {useCallback,useEffect,useRef,useState,type ChangeEvent} from 'react';
import {familyAlbumCount,getFamilyDirectory,getFamilyAlbumMedia,uploadFamilyAlbumFile,uploadFamilyVideoPoster,updateFamilyAlbumFile,FamilyApiError,type FamilyDirectory,type FamilyAlbum,type FamilyMediaItem} from '@havana/shared';
import FamilyMediaGallery,{familyPrivateMediaUrl} from './FamilyMediaGallery';
import {useFamilyLive} from '../../services/use-family-live';
import {createFamilyVideoPoster} from '../../services/family-video-poster';

function formatStorageGB(bytes:number){return (bytes/1_000_000_000).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}
function formatFileMB(bytes:number){return (bytes/1_000_000).toFixed(0)+' MB';}
export default function AdminFamily({token,onExpired}:{token:string;onExpired:()=>void}){
 const [data,setData]=useState<FamilyDirectory|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<string|null>(null);
 const [bookOpen,setBookOpen]=useState(false);
 const [items,setItems]=useState<FamilyMediaItem[]>([]);
 const [mediaLoading,setMediaLoading]=useState(false);
 const [uploading,setUploading]=useState(false);
 const [uploadNote,setUploadNote]=useState('');
 const [uploadPercent,setUploadPercent]=useState<number|null>(null);
 const [failedFiles,setFailedFiles]=useState<File[]>([]);
 const [uploadFailures,setUploadFailures]=useState<string[]>([]);
 const [posterWarnings,setPosterWarnings]=useState<string[]>([]);
 const [mediaTick,setMediaTick]=useState(0);
 const requestId=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++requestId.current;
  setBusy(true);
  try{
   const next=await getFamilyDirectory(token,true);
   if(id===requestId.current){setData(next);setError('');}
  }catch(e){
   if(id!==requestId.current)return;
   if(e instanceof FamilyApiError&&e.status===401)onExpired();
   setError(e instanceof Error?e.message:'No se pudo consultar Familia HAVANA NICE.');
  }finally{if(id===requestId.current)setBusy(false);}
 },[token,onExpired]);
 useEffect(()=>{
  setData(null);setSelected(null);setBookOpen(false);
  void refresh();
  const resume=()=>{if(!document.hidden)void refresh();};
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  return()=>{++requestId.current;document.removeEventListener('visibilitychange',resume);
   window.removeEventListener('online',resume);};
 },[refresh]);
 useEffect(()=>{
  if(!selected||!data?.mediaReady){setItems([]);setMediaLoading(false);return;}
  let cancelled=false;setItems([]);setMediaLoading(true);
  void getFamilyAlbumMedia(token,selected,true).then(next=>{
   if(!cancelled){setItems(next.items);setError('');}
  }).catch(e=>{
   if(cancelled)return;
   if(e instanceof FamilyApiError&&e.status===401)onExpired();
   setError(e instanceof Error?e.message:'No se pudo cargar el álbum.');
  }).finally(()=>{if(!cancelled)setMediaLoading(false);});
  return()=>{cancelled=true;};
 },[selected,token,onExpired,data?.mediaReady,mediaTick]);
 const uploadBatch=async(files:File[])=>{
  if(!selected||!files.length||uploading)return;
  if(files.length>5){setError('Selecciona como máximo cinco archivos por envío.');return;}
  setFailedFiles([]);setUploadFailures([]);setPosterWarnings([]);setError('');
  setUploading(true);setUploadPercent(0);
  setUploadNote('Preparando '+files.length+' '+(files.length===1?'archivo':'archivos')+'…');
  const totalBytes=files.reduce((sum,file)=>sum+file.size,0);
  const sentBytes=files.map(()=>0);
  let cursor=0,completed=0,lastPercent=-1;
  const failures:{file:File;reason:string;retryable:boolean}[]=[];
  const posterIssues:string[]=[];
  const updateProgress=()=>{
   const loaded=sentBytes.reduce((sum,bytes)=>sum+bytes,0);
   const percent=totalBytes?Math.min(100,Math.round(loaded*100/totalBytes)):0;
   if(percent===lastPercent)return;
   lastPercent=percent;
   setUploadPercent(percent);
   setUploadNote(percent===100?'Envío completo. Confirmando archivos en R2…':
    'Subiendo '+files.length+' archivos… '+percent+' %');
  };
  const worker=async()=>{
   while(cursor<files.length){
    const index=cursor++;
    const file=files[index];
    if(!file)continue;
    const name=file.name||'Archivo '+(index+1);
    if(file.size>9_500_000_000){
     failures.push({file,retryable:false,reason:name+': supera el espacio máximo del álbum (9.5 GB).'});
     continue;
    }
    if(!file.size){
     failures.push({file,retryable:false,reason:name+': archivo vacío.'});
     continue;
    }
    try{
     // Capture from the local source while R2 receives the untouched original.
     const isVideo=file.type.startsWith('video/');
     const preview=isVideo?createFamilyVideoPoster(file):Promise.resolve(null);
     const id=await uploadFamilyAlbumFile(token,selected!,file,(bytes)=>{
      sentBytes[index]=bytes;updateProgress();
     });
     sentBytes[index]=file.size;completed++;updateProgress();
     if(isVideo){
      const blob=await preview;
      if(blob){
       try{await uploadFamilyVideoPoster(token,selected!,id,blob);}
       catch(e){
        posterIssues.push(name+': portada no disponible ('+
         (e instanceof Error?e.message:'Error de red')+'). Puedes generarla desde el visor.');
       }
      }else posterIssues.push(name+': el navegador no pudo extraer el cuadro de video. Puedes generarlo desde el visor.');
     }
    }catch(e){
     // Reset failed network bytes; a transferred file is not necessarily persisted.
     sentBytes[index]=0;updateProgress();
     if(e instanceof FamilyApiError&&e.status===401)onExpired();
     const reason=e instanceof Error?e.message:'Error desconocido';
     failures.push({file,retryable:!(e instanceof FamilyApiError&&[400,401,403,404,409,413,415].includes(e.status)),reason:name+': '+reason});
    }
   }
  };
  try{
   // 1 multipart video at a time (it already transfers up to 3 parts concurrently).
   // 2 simultaneous small photos are safe without saturating mobile uploads.
   const concurrent=files.some(file=>file.type.startsWith('video/')||/\\.(mp4|mov)$/i.test(file.name))
    ?1:Math.min(2,files.length);
   await Promise.all(Array.from({length:concurrent},()=>worker()));
   setPosterWarnings(posterIssues);
   setFailedFiles(failures.filter(item=>item.retryable).map(item=>item.file));
   setUploadFailures(failures.map(item=>item.reason));
   setUploadNote(failures.length?
    completed+' de '+files.length+' archivos guardados; '+failures.length+
    ' no guardados. Revisa el motivo abajo.':
    completed+' de '+files.length+' archivos guardados de forma privada.');
  }finally{
   setUploading(false);setUploadPercent(null);
   setMediaTick(x=>x+1);
   void refresh();
  }
 };
 const uploadFiles=async(event:ChangeEvent<HTMLInputElement>)=>{
  const files=Array.from(event.target.files||[]);event.target.value='';
  await uploadBatch(files);
 };
 const createExistingPoster=async(id:string,url:string)=>{
  if(!selected||uploading)return;
  setError('');setUploading(true);
  setUploadNote('Creando una miniatura real del video…');
  try{
   const poster=await createFamilyVideoPoster(url);
   if(!poster)throw new Error('Este formato de video no permite extraer una miniatura desde este navegador.');
   await uploadFamilyVideoPoster(token,selected,id,poster);
   setPosterWarnings([]);
   setUploadNote('Miniatura privada generada correctamente.');
  }catch(e){
   if(e instanceof FamilyApiError&&e.status===401)onExpired();
   setError(e instanceof Error?e.message:'No se pudo generar la miniatura.');
  }finally{
   setUploading(false);
   setMediaTick(t=>t+1);
   void refresh();
  }
 };
 const changeFile=async(id:string,action:'delete'|'cover')=>{
  if(!selected||uploading)return;
  setError('');setUploadNote(action==='delete'?'Eliminando archivo privado…':'Cambiando portada…');
  setUploading(true);
  try{
   await updateFamilyAlbumFile(token,selected,id,action);
   setUploadNote(action==='delete'?'Archivo eliminado definitivamente.':'Portada actualizada.');
  }catch(e){
   if(e instanceof FamilyApiError&&e.status===401)onExpired();
   setError(e instanceof Error?e.message:'No se pudo administrar el archivo.');
  }finally{
   setUploading(false);
   setMediaTick(t=>t+1);
   void refresh();
  }
 };
 const storage=data?.storage;
 useFamilyLive(token,true,()=>{
  void refresh();
  setMediaTick(t=>t+1);
 });
 const album=data?.albums.find(item=>item.actorId===selected);
 const cover=album?.mediaReady?familyPrivateMediaUrl(album.coverUrl):null;
 const readyItems=album?.mediaReady?items:undefined;
 const goBack=()=>{setSelected(null);setBookOpen(false);};
 return <section className="a-panel a-family" aria-label="Familia HAVANA NICE Administrador">
  <div className="a-cal-toolbar">
   <div><h2>Familia HAVANA NICE</h2>
    <p className="a-detail">Álbumes asociados al acceso autorizado de cada integrante.</p></div>
   <button type="button" disabled={busy} onClick={()=>{void refresh();setMediaTick(t=>t+1);}}>Actualizar</button>
  </div>
  {storage?<div className={'a-family-storage'+(storage.warning?' a-family-storage-warn':'')}
   role={storage.warning?'alert':'status'} aria-live="polite">
   <strong>Almacenamiento privado · {formatStorageGB(storage.usedBytes)} GB de 9.5 GB</strong>
   <progress max={storage.maxBytes} value={Math.min(storage.maxBytes,storage.usedBytes+storage.pendingBytes)}
    aria-label="Almacenamiento ocupado en Familia"/>
   <small>{storage.pendingBytes?formatFileMB(storage.pendingBytes)+' reservados en subidas · ':''}
    {formatStorageGB(storage.remainingBytes)} GB disponibles</small>
   {storage.stopped?<p>Almacenamiento detenido para proteger el límite gratuito. Elimina archivos antes de subir más.</p>:
    storage.warning?<p>Aviso: Familia alcanzó 9 GB. Se detendrán nuevas cargas al llegar a 9.5 GB.</p>:null}
  </div>:null}
  {error&&<p className="a-admin-error" role="alert">{error}</p>}
  {bookOpen||album?<button type="button" className="a-family-back" onClick={goBack}>‹ Todos los álbumes</button>:null}
  {bookOpen?<>
   <div className="a-family-book-view" aria-label="BOOK HAVANA NICE">
    <span>EDICIONES EDITORIALES</span>
    <h3>BOOK HAVANA NICE</h3>
    <p>Todavía no hay ediciones publicadas.</p>
   </div>
   <p className="a-detail">No hay ediciones de BOOK publicadas. El almacenamiento privado ya funciona; falta implementar las páginas editoriales y el efecto de revista 3D.</p>
  </>:album?<>
   <div className="a-family-cover">
    {cover?<img className="a-family-cover-photo" src={cover} alt="" decoding="async"/>:
     <span aria-hidden="true" className="a-family-cover-letter">{album.name.slice(0,1).toUpperCase()}</span>}
    <div><h3>{album.name}</h3><p>{familyAlbumCount(album)}</p></div>
   </div>
   {album.mediaReady?<div className="a-family-upload">
    <label htmlFor="a-family-media-file">Añadir fotos o videos al álbum (hasta 5 por selección · sujeto al espacio libre)</label>
    <input id="a-family-media-file" type="file" multiple disabled={uploading||storage?.stopped}
     accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime"
     onChange={event=>void uploadFiles(event)}/>
    {uploadPercent!==null?<progress className="a-family-upload-progress" max={100} value={uploadPercent} aria-label="Progreso de carga"/>:null}
    {uploadNote?<p role="status">{uploadNote}</p>:null}
    {posterWarnings.length?<div className="a-family-upload-warnings" role="status">
     {posterWarnings.map((notice,index)=><p key={index}>{notice}</p>)}
    </div>:null}
    {uploadFailures.length?<div className="a-family-upload-errors" role="alert">
     <strong>Archivos que no se guardaron</strong>
     <ul>{uploadFailures.map((reason,index)=><li key={index}>{reason}</li>)}</ul>
     {failedFiles.length?<button type="button" disabled={uploading}
      onClick={()=>void uploadBatch(failedFiles)}>Reintentar solo {failedFiles.length} fallidos</button>:null}
    </div>:null}
   </div>:null}
   {mediaLoading?<p className="a-detail">Cargando archivos privados…</p>:
    readyItems?.length?<FamilyMediaGallery items={readyItems} onDelete={id=>changeFile(id,'delete')} onSetCover={id=>changeFile(id,'cover')} onMakePoster={createExistingPoster}/>:
    <p className="a-detail">{album.mediaReady?'Este álbum todavía no tiene fotos ni videos.':'La carga privada estará disponible cuando se publique el nuevo Worker y su esquema D1.'}</p>}
  </>:<>
   <p className="a-detail">Los integrantes se administran desde «Acceso a músicos». Aquí aparecen únicamente los nombres autorizados; no se crean cuentas paralelas.</p>
   {!data&&!error?<p>Cargando integrantes…</p>:<div className="a-family-list">
    {data?.albums.map(item=><button type="button" key={item.actorId} className="a-family-person"
     onClick={()=>{setBookOpen(false);setSelected(item.actorId);}}
     aria-label={'Abrir álbum de '+item.name}>
     <span className="a-family-avatar" aria-hidden="true">{item.name.slice(0,1).toUpperCase()}</span>
     <span className="a-family-person-details"><strong>{item.name}</strong>
      <small>{familyAlbumCount(item)}</small></span>
     <span className="a-family-status">Ver álbum ›</span>
    </button>)}
    {data?.albums.length===0?<p className="a-detail">No hay integrantes autorizados.</p>:null}
   </div>}
   <button type="button" className="a-family-book" onClick={()=>{setSelected(null);setBookOpen(true);}}
    aria-label="Abrir BOOK HAVANA NICE en Administración">
    <span>EDICIONES EDITORIALES</span><strong>BOOK HAVANA NICE</strong>
    <small>Ver sección editorial ›</small>
   </button>
  </>}
 </section>;
}
