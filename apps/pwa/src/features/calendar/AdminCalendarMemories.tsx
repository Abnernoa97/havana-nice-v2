import {useCallback,useEffect,useRef,useState} from 'react';
import {BOOK_GRANT_RENEW_MS,addCalendarMemory,addCalendarMemoryWebp,calendarMemoryUrl,
 deleteCalendarMemory,getCalendarMemories,moveCalendarMemory,
 type CalendarMemoryPhoto} from '@havana/shared';
import {optimizeBookPhoto} from '../book/book-image-optimizer';
import BookReader from '../book/BookReader';

export default function AdminCalendarMemories({token,eventId,title,revision=0}:{
 token:string;eventId:string;title:string;revision?:number
}){
 const [photos,setPhotos]=useState<CalendarMemoryPhoto[]>([]);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [progress,setProgress]=useState(0);
 const [notice,setNotice]=useState('');
 const [error,setError]=useState('');
 const [preview,setPreview]=useState(false);
 const requestId=useRef(0);
 const refresh=useCallback(async()=>{
  const run=++requestId.current;
  try{
   const list=await getCalendarMemories(token,eventId,true);
   if(run===requestId.current){setPhotos(list);setError('');}
  }catch(e){
   if(run===requestId.current)setError(e instanceof Error?e.message:'No se pudieron cargar las fotos.');
  }finally{if(run===requestId.current)setLoading(false);}
 },[token,eventId]);
 useEffect(()=>{
  void refresh();
  return()=>{requestId.current++;};
 },[refresh,revision]);
 // Photo URLs are private, expiring grants just like BOOK. Renew once before
 // expiration while this Admin editor is visible, never every Calendar poll.
 useEffect(()=>{
  if(!photos.length)return;
  const timer=window.setTimeout(()=>{
   if(!document.hidden&&navigator.onLine)void refresh();
  },BOOK_GRANT_RENEW_MS);
  return()=>window.clearTimeout(timer);
 },[photos,refresh]);
 const upload=async(files:File[])=>{
  if(busy||!files.length)return;
  if(files.length>5){setError('Máximo cinco fotos por selección.');return;}
  if(photos.length+files.length>50){setError('Máximo 50 fotos por evento.');return;}
  setBusy(true);setError('');setNotice('');setProgress(0);
  const problems:string[]=[];
  let saved=0,light=0;
  for(let i=0;i<files.length;i++){
   const file=files[i];
   if(!file)continue;
   let id='';
   try{
    setNotice('Guardando original '+(i+1)+' de '+files.length+'…');
    id=await addCalendarMemory(token,eventId,file);
    saved++;
    setNotice('Preparando fotografía BOOK '+(i+1)+' de '+files.length+'…');
    try{
     const optimized=await optimizeBookPhoto(file);
     if(optimized){
      await addCalendarMemoryWebp(token,eventId,id,optimized.blob,optimized.width,optimized.height);
      light++;
     }
    }catch(e){
     problems.push(file.name+': original conservado; versión ligera pendiente ('+
      (e instanceof Error?e.message:'Error')+')');
    }
   }catch(e){
    problems.push(file.name+': '+(e instanceof Error?e.message:'No se pudo cargar'));
   }
   setProgress(Math.round((i+1)*100/files.length));
  }
  await refresh();
  setBusy(false);
  setNotice(saved+' fotografías guardadas · '+light+' optimizadas para BOOK');
  if(problems.length)setError(problems.join(' · '));
 };
 const optimizePending=async()=>{
  if(busy)return;
  const pending=photos.filter(x=>!!x.originalUrl&&!x.optimizedSizeBytes&&(x.sizeBytes||0)>300000);
  if(!pending.length)return;
  setBusy(true);setProgress(0);setError('');setNotice('');
  let converted=0;const errors:string[]=[];
  for(let i=0;i<pending.length;i++){
   const photo=pending[i];
   if(!photo)continue;
   try{
    const url=calendarMemoryUrl(photo.originalUrl||'');
    if(!url)throw Error('Enlace privado inválido');
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw Error('No se pudo recuperar el original');
    const blob=await response.blob();
    const webp=await optimizeBookPhoto(blob);
    if(webp){
     await addCalendarMemoryWebp(token,eventId,photo.id,webp.blob,webp.width,webp.height);
     converted++;
    }
   }catch(e){errors.push('Foto '+(i+1)+': '+(e instanceof Error?e.message:'Error'));}
   setProgress(Math.round((i+1)*100/pending.length));
  }
  await refresh();
  setBusy(false);
  setNotice(converted+' fotografías optimizadas. Originales intactos.');
  if(errors.length)setError(errors.join(' · '));
 };
 const remove=async(id:string)=>{
  if(busy||!window.confirm('¿Borrar esta fotografía del recuerdo?'))return;
  setBusy(true);setError('');
  try{
   await deleteCalendarMemory(token,eventId,id);
   await refresh();setNotice('Fotografía eliminada del recuerdo.');
  }catch(e){setError(e instanceof Error?e.message:'No se pudo borrar');}
  finally{setBusy(false);}
 };
 const move=async(index:number,direction:-1|1)=>{
  if(busy)return;
  const current=photos[index],other=photos[index+direction];
  if(!current||!other)return;
  setBusy(true);setError('');
  try{
   await moveCalendarMemory(token,eventId,current.id,other.position);
   await moveCalendarMemory(token,eventId,other.id,current.position);
   await refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'No se pudo ordenar las fotografías');
   await refresh();
  }finally{setBusy(false);}
 };
 const pending=photos.filter(x=>!!x.originalUrl&&!x.optimizedSizeBytes&&(x.sizeBytes||0)>300000);
 return <section className="a-calendar-memory-admin" aria-label={'Recuerdos de '+title}>
  <h3>Recuerdos del evento</h3>
  <p>Sube las fotografías de este día. Se conservarán originales privados y BOOK mostrará versiones ligeras. Solo los músicos asignados podrán abrir el recuerdo al finalizar el evento.</p>
  <label className="a-calendar-memory-picker">Añadir fotografías · hasta 5 por selección
   <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
    disabled={busy||photos.length>=50}
    onChange={e=>{const files=Array.from(e.currentTarget.files||[]);e.currentTarget.value='';void upload(files);}}/>
  </label>
  {busy?<progress max={100} value={progress} aria-label="Progreso de fotografías"/>:null}
  {notice?<p role="status">{notice}</p>:null}
  {error?<p className="a-admin-error" role="alert">{error}</p>:null}
  {loading?<p>Consultando fotografías…</p>:
   <p>{photos.length} fotografías · {photos.filter(p=>p.optimizedSizeBytes).length} optimizadas</p>}
  {pending.length>0?<button type="button" disabled={busy}
   onClick={()=>void optimizePending()}>Optimizar {pending.length} fotografías pendientes</button>:null}
  {photos.length>0?<div className="a-calendar-memory-grid">
   {photos.map((photo,index)=><article className="a-calendar-memory-photo" key={photo.id}>
    {calendarMemoryUrl(photo.url)?<img src={calendarMemoryUrl(photo.url)!}
     alt={'Foto '+(index+1)+' del evento'} loading="lazy"/>:null}
    <small>{String(index+1).padStart(2,'0')} · {photo.optimizedSizeBytes&&photo.sizeBytes
     ?Math.round((1-photo.optimizedSizeBytes/photo.sizeBytes)*100)+'% menos':'Original privado'}</small>
    <div className="a-calendar-memory-actions">
     <button type="button" disabled={busy||index===0} onClick={()=>void move(index,-1)} aria-label={'Subir foto '+(index+1)}>↑</button>
     <button type="button" disabled={busy||index===photos.length-1} onClick={()=>void move(index,1)} aria-label={'Bajar foto '+(index+1)}>↓</button>
     <button type="button" disabled={busy} onClick={()=>void remove(photo.id)}>Borrar</button>
    </div>
   </article>)}
  </div>:null}
  {photos.length>0?<div className="a-calendar-memory-preview">
   <button type="button" onClick={()=>setPreview(x=>!x)}>{preview?'Cerrar revista':'Ver recuerdo como BOOK'}</button>
   {preview?<BookReader edition="calendar" coverTitle={title} pages={photos.map(p=>({
    id:p.id,url:p.url,fit:p.fit,position:p.position,published:true
   }))}/>:null}
  </div>:null}
 </section>;
}
