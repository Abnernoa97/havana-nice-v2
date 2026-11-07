import {useCallback,useEffect,useRef,useState} from 'react';
import {BOOK_GRANT_RENEW_MS,BookApiError,bookMediaUrl,getBookPages,removeBookPage,updateBookPage,uploadBookPage,type BookPage} from '@havana/shared';
import BookReader from './BookReader';

export default function AdminBook({token,onExpired,tick=0}:{token:string;onExpired:()=>void;tick?:number}){
 const [pages,setPages]=useState<BookPage[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [note,setNote]=useState('');
 const [progress,setProgress]=useState(0);
 const [preview,setPreview]=useState(false);
 const sequence=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++sequence.current;
  try{
   const next=await getBookPages(token,true);
   if(id===sequence.current){setPages(next);setError('');}
  }catch(e){
   if(id!==sequence.current)return;
   if(e instanceof BookApiError&&e.status===401)onExpired();
   setError(e instanceof Error?e.message:'No se pudo cargar BOOK.');
  }finally{if(id===sequence.current)setLoading(false);}
 },[token,onExpired]);
 useEffect(()=>{
  setLoading(true);void refresh();
  return()=>{sequence.current++;};
 },[refresh,tick]);
 // Do not reissue grants continuously: renew once before expiration, or
 // immediately after the Admin returns to this screen from the background.
 useEffect(()=>{
  const resume=()=>{if(!document.hidden&&navigator.onLine)void refresh();};
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume);
  return()=>{document.removeEventListener('visibilitychange',resume);
   window.removeEventListener('online',resume);};
 },[refresh]);
 useEffect(()=>{
  if(!pages.length)return;
  const timer=window.setTimeout(()=>{
   if(!document.hidden&&navigator.onLine)void refresh();
  },BOOK_GRANT_RENEW_MS);
  return()=>window.clearTimeout(timer);
 },[pages,refresh]);
 const upload=async(files:File[])=>{
  if(busy||!files.length)return;
  if(files.length>5){setError('Puedes elegir hasta cinco imágenes por selección.');return;}
  setBusy(true);setError('');setProgress(0);
  const errors:string[]=[];
  for(let i=0;i<files.length;i++){
   const f=files[i];
   if(!f)continue;
   try{
    setNote('Guardando página '+(i+1)+' de '+files.length+'…');
    await uploadBookPage(token,f,(loaded,total)=>{
     setProgress(Math.round(((i+(total?loaded/total:0))/files.length)*100));
    });
   }catch(e){
    errors.push(f.name+': '+(e instanceof Error?e.message:'Error de subida'));
    if(e instanceof BookApiError&&e.status===401){onExpired();break;}
   }
  }
  setProgress(100);setBusy(false);await refresh();
  setNote(errors.length?'Algunas imágenes no se guardaron.':'Imágenes publicadas.');
  if(errors.length)setError(errors.join(' · '));
 };
 const change=async(id:string,payload:Partial<Pick<BookPage,'position'|'fit'|'published'>>)=>{
  if(busy)return;
  setBusy(true);setError('');
  try{await updateBookPage(token,id,payload);await refresh();}
  catch(e){if(e instanceof BookApiError&&e.status===401)onExpired();
   setError(e instanceof Error?e.message:'No se pudo guardar el cambio.');}
  finally{setBusy(false);}
 };
 const reorder=async(index:number,direction:-1|1)=>{
  const other=pages[index+direction],current=pages[index];
  if(!other||!current||busy)return;
  setBusy(true);setError('');
  try{
   await updateBookPage(token,current.id,{position:other.position});
   await updateBookPage(token,other.id,{position:current.position});
   await refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'No se pudo cambiar el orden.');
   await refresh();
  }finally{setBusy(false);}
 };
 const remove=async(id:string)=>{
  if(busy||!window.confirm('¿Eliminar definitivamente esta página del BOOK?'))return;
  setBusy(true);setError('');
  try{await removeBookPage(token,id);await refresh();}
  catch(e){
   if(e instanceof BookApiError&&e.status===401)onExpired();
   setError(e instanceof Error?e.message:'No se pudo eliminar.');}
  finally{setBusy(false);}
 };
 return <div className="hn-book-admin" aria-label="BOOK HAVANA NICE · Administración">
  <h2>BOOK HAVANA NICE</h2>
  <p>Aquí eliges las imágenes, su orden y cómo llenan cada página. Los músicos ven los cambios publicados en su libro. No modifica los álbumes de Familia.</p>
  <div className="hn-book-admin-upload">
   <label htmlFor="hn-book-upload">Añadir fotografías · máximo 5 por selección · JPG, PNG, WebP o HEIC · hasta 15 MB cada una</label>
   <input id="hn-book-upload" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
    multiple disabled={busy} onChange={event=>{const files=Array.from(event.currentTarget.files||[]);event.currentTarget.value='';void upload(files);}}/>
   {busy?<progress aria-label="Carga de páginas" max={100} value={progress}/>:null}
   {note?<small role="status">{note}</small>:null}
  </div>
  {error?<p className="hn-book-admin-error" role="alert">{error}</p>:null}
  <div className="hn-book-admin-count">{loading?'Consultando páginas…':pages.length+' páginas guardadas · '+pages.filter(p=>p.published).length+' publicadas'}</div>
  {pages.length?<div className="hn-book-admin-list">
   {pages.map((item,i)=><div className="hn-book-admin-row" key={item.id}>
    {bookMediaUrl(item.url)?<img src={bookMediaUrl(item.url)!} alt={'Vista previa página '+(i+1)} loading="lazy"/>:null}
    <div className="hn-book-admin-row-main">
     <strong>{String(i+1).padStart(2,'0')} · {item.published?'Visible para músicos':'Oculta'}</strong>
     <div className="hn-book-admin-row-actions">
      <button type="button" disabled={busy||i===0} onClick={()=>void reorder(i,-1)} aria-label={'Subir página '+(i+1)}>↑</button>
      <button type="button" disabled={busy||i===pages.length-1} onClick={()=>void reorder(i,1)} aria-label={'Bajar página '+(i+1)}>↓</button>
      <button type="button" disabled={busy} onClick={()=>void change(item.id,{fit:item.fit==='cover'?'contain':'cover'})}>
       {item.fit==='cover'?'Llenar página':'Imagen completa'}
      </button>
      <button type="button" disabled={busy} onClick={()=>void change(item.id,{published:!item.published})}>
       {item.published?'Ocultar':'Publicar'}
      </button>
      <button type="button" className="hn-book-delete" disabled={busy} onClick={()=>void remove(item.id)}>Eliminar</button>
     </div>
    </div>
   </div>)}
  </div>:null}
  {pages.length?<div className="hn-book-admin-preview">
   <button type="button" onClick={()=>setPreview(x=>!x)}>{preview?'Cerrar vista previa':'Abrir revista 3D · vista previa'}</button>
   {preview?<BookReader pages={pages.filter(p=>p.published)}/>:null}
  </div>:null}
 </div>;
}
