import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {getCalendarEvents,calendarDate,CalendarHttpError,HAVANA_V2_DEV_API_BASE_URL,getRepertoireSongs,
 getEventRepertoire,safeRepertoireLink,type RepertoireSong,type RepertoireSongInput,
 type RepertoireEventItem,type CalendarEvent} from '@havana/shared';
import {watchRepertoire} from '../../services/calendar-live';
import {adminCreateSong,adminEditSong,adminDeleteSong,adminAddEventSongs,
 adminAddEventSpecial,adminRemoveEventItem,adminCompleteEventItem,adminReorderEventItems,
 isAdminUnauthorized} from '../../services/admin-api';

const empty=():RepertoireSongInput=>({
 title:'',artist:'',category:'ENGLISH',referenceUrl:'',position:0,active:true
});
export default function AdminRepertoire({token,onExpired}:{token:string;onExpired:()=>void}){
 const [songs,setSongs]=useState<RepertoireSong[]>([]);
 const [events,setEvents]=useState<CalendarEvent[]>([]);
 const [eventId,setEventId]=useState('');
 const eventIdRef=useRef(eventId);
 eventIdRef.current=eventId;
 const itemsRequest=useRef(0);
 const catalogRequest=useRef(0);
 const [items,setItems]=useState<RepertoireEventItem[]>([]);
 const [editing,setEditing]=useState<RepertoireSong|null>(null);
 const [form,setForm]=useState<RepertoireSongInput>(empty);
 const [special,setSpecial]=useState({title:'',artist:'',referenceUrl:''});
 const [checked,setChecked]=useState<string[]>([]);
 const [query,setQuery]=useState('');
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [open,setOpen]=useState<'event'|'general'|null>('event');
 const capture=(e:unknown)=>{if(isAdminUnauthorized(e)||(e instanceof CalendarHttpError&&e.status===401))onExpired();
  setError(e instanceof Error?e.message:'No se pudo guardar Repertorio.');};
 const refresh=useCallback(async()=>{
  const request=++catalogRequest.current;
  try{
   const [catalog,dates]=await Promise.all([
    getRepertoireSongs(token,true),getCalendarEvents(token,HAVANA_V2_DEV_API_BASE_URL,true)]);
   if(request!==catalogRequest.current)return;
   setSongs(catalog);setEvents(dates);
   setEventId(prev=>dates.some(e=>e.id===prev)?prev:(dates[0]?.id||''));
   setError('');
  }catch(e){
   if(request!==catalogRequest.current)return;
   if(isAdminUnauthorized(e)||(e instanceof CalendarHttpError&&e.status===401))onExpired();
   else setError(e instanceof Error?e.message:'No se pudo cargar Repertorio.');
  }finally{if(request===catalogRequest.current)setLoading(false);}
 },[token,onExpired]);
 const refreshItems=useCallback(async(id:string)=>{
  // Ignore stale responses when the Admin switches events while a request is in flight.
  const request=++itemsRequest.current;
  if(!id){setItems([]);return;}
  try{
   const next=await getEventRepertoire(token,id,true);
   if(request===itemsRequest.current&&eventIdRef.current===id){
    setItems(next);setError('');
   }
  }catch(e){
   if(request===itemsRequest.current&&eventIdRef.current===id){
    if(isAdminUnauthorized(e))onExpired();
    else setError(e instanceof Error?e.message:'No se pudo cargar la lista del evento.');
   }
  }
 },[token,onExpired]);
 // One refresh path for the button, focus/online recovery and successful writes:
 // otherwise the song catalog updates while the selected event list stays stale.
 const refreshAll=useCallback(async()=>{
  await refresh();
  if(eventIdRef.current)await refreshItems(eventIdRef.current);
 },[refresh,refreshItems]);
 useEffect(()=>{
  void refreshAll(); // Carga D1 inmediata; no esperar apertura del canal de avisos.
  const stop=watchRepertoire(token,true,()=>{if(!document.hidden&&navigator.onLine)void refreshAll();});
  return()=>{catalogRequest.current++;itemsRequest.current++;stop();};
 },[token,refreshAll]);
 useEffect(()=>{void refreshItems(eventId);setChecked([]);},[eventId,refreshItems]);
 useEffect(()=>()=>{itemsRequest.current+=1;},[]);
 const wrap=async(action:()=>Promise<unknown>,message:string)=>{
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{await action();await refreshAll();setNotice(message);}
  catch(e){capture(e);}
  finally{setBusy(false);}
 };
 async function saveSong(e:FormEvent){
  e.preventDefault();
  await wrap(async()=>{
   if(editing)await adminEditSong(token,editing.id,{...form,version:editing.version});
   else await adminCreateSong(token,{...form,position:songs.length});
   setEditing(null);setForm(empty());
  },editing?'Canción actualizada.':'Canción añadida al repertorio general.');
 }
 async function removeSong(song:RepertoireSong){
  if(!window.confirm('¿Borrar "'+song.title+'" del repertorio general? Su copia en un evento se conservará.'))return;
  await wrap(async()=>{await adminDeleteSong(token,song.id,song.version);},
   'Canción eliminada del repertorio general.');
 }
 async function addSelected(){
  if(!eventId||!checked.length)return;
  await wrap(async()=>{
   await adminAddEventSongs(token,eventId,checked);
   setChecked([]);
  },'Canciones añadidas al evento.');
 }
 async function addSpecial(e:FormEvent){
  e.preventDefault();if(!eventId)return;
  await wrap(async()=>{
   await adminAddEventSpecial(token,eventId,special);
   setSpecial({title:'',artist:'',referenceUrl:''});
  },'Canción especial añadida solo a este evento.');
 }
 async function setComplete(item:RepertoireEventItem){
  await wrap(async()=>{await adminCompleteEventItem(token,item.id,!item.completed);
  },'Progreso del evento actualizado.');
 }
 async function removeItem(item:RepertoireEventItem){
  if(!window.confirm('¿Quitar "'+item.title+'" de este evento?'))return;
  await wrap(async()=>{await adminRemoveEventItem(token,item.id);},
   'Canción quitada del evento.');
 }
 async function move(index:number,step:number){
  const copy=[...items],other=index+step;
  if(other<0||other>=copy.length)return;
  const current=copy[index]!;copy[index]=copy[other]!;copy[other]=current;
  await wrap(async()=>{
   await adminReorderEventItems(token,eventId,copy.map(x=>x.id));
  },'Orden actualizado.');
 }
 const available=songs.filter(s=>s.active&&!items.some(x=>x.songId===s.id)&&
  (s.title+' '+s.artist).toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
 return <section className="a-panel a-repertoire" aria-label="Repertorio Administrador">
  <div className="a-cal-toolbar">
   <div><h2>Repertorio</h2><p className="a-detail">General y listas independientes por evento.</p></div>
   <button type="button" onClick={()=>void refreshAll()} disabled={busy}>Actualizar</button>
  </div>
  {!!error&&<p className="a-admin-error" role="alert">{error}</p>}
  {!!notice&&<p className="a-cal-notice" role="status">{notice}</p>}
  {loading?<p>Cargando repertorio…</p>:<>
   <article className="a-rep-section">
    <button type="button" className="a-cal-summary" aria-expanded={open==='event'}
     onClick={()=>setOpen(v=>v==='event'?null:'event')}>
     <span><strong>Repertorio del evento</strong><small>Lista del día · canciones y especiales</small></span>
     <b>{open==='event'?'−':'+'}</b>
    </button>
    {open==='event'&&<div className="a-rep-body">
     <label className="a-cal-field"><span>Evento del Calendario</span>
      <select value={eventId} disabled={busy} onChange={e=>{setItems([]);setEventId(e.target.value);}}>
       {events.length===0?<option value="">No hay eventos</option>:
        events.map(e=><option key={e.id} value={e.id}>{calendarDate(e.date)} · {e.title}</option>)}
      </select>
     </label>
     {!eventId?<p>Primero crea una fecha desde Calendario.</p>:<>
      <h3>Seleccionar canciones del repertorio general</h3>
      <input type="text" value={query} placeholder="Buscar canción o artista" autoComplete="off"
       onChange={e=>setQuery(e.target.value)}/>
      <div className="a-cal-actions">
       <button type="button" onClick={()=>setChecked(available.map(x=>x.id))}>Marcar visibles</button>
       <button type="button" onClick={()=>setChecked([])}>Limpiar selección</button>
      </div>
      <div className="a-rep-choices">{available.map(s=><label className="a-cal-person" key={s.id}>
       <input type="checkbox" checked={checked.includes(s.id)}
        onChange={e=>setChecked(v=>e.target.checked?[...v,s.id]:v.filter(id=>id!==s.id))}/>
       <span>{s.title}{s.artist&&' · '+s.artist}</span></label>)}</div>
      <button type="button" disabled={busy||checked.length===0} onClick={()=>void addSelected()}>
       Añadir {checked.length} seleccionada(s)
      </button>
      <h3>Canción nueva / especial</h3>
      <p className="a-detail">Solo para este evento, no modifica el repertorio general.</p>
      <form onSubmit={e=>void addSpecial(e)} className="a-rep-fields">
       <input type="text" required value={special.title} placeholder="Título"
        onChange={e=>setSpecial(v=>({...v,title:e.target.value}))}/>
       <input type="text" value={special.artist} placeholder="Artista"
        onChange={e=>setSpecial(v=>({...v,artist:e.target.value}))}/>
       <input type="text" value={special.referenceUrl} placeholder="Link de referencia · https://"
        onChange={e=>setSpecial(v=>({...v,referenceUrl:e.target.value}))}/>
       <button disabled={busy} type="submit">Añadir especial</button>
      </form>
      <h3>{items.filter(x=>x.completed).length} / {items.length} realizadas</h3>
      <div className="a-rep-items">{items.map((item,index)=><div className="a-rep-item" key={item.id}>
       <input aria-label={'Completar '+item.title} type="checkbox" checked={item.completed}
        disabled={busy} onChange={()=>void setComplete(item)}/>
       <div><strong>{index+1}. {item.title}</strong><small>{item.artist||'Sin artista'}{!item.songId?' · Especial':''}</small>
        {safeRepertoireLink(item.referenceUrl)&&<a href={safeRepertoireLink(item.referenceUrl)!}
         target="_blank" rel="noopener noreferrer">Revisar link</a>}</div>
       <button type="button" aria-label={'Subir '+item.title} disabled={busy||index===0}
        onClick={()=>void move(index,-1)}>↑</button>
       <button type="button" aria-label={'Bajar '+item.title} disabled={busy||index===items.length-1}
        onClick={()=>void move(index,1)}>↓</button>
       <button type="button" disabled={busy} onClick={()=>void removeItem(item)}>Quitar</button>
      </div>)}</div>
     </>}
    </div>}
   </article>
   <article className="a-rep-section">
    <button type="button" className="a-cal-summary" aria-expanded={open==='general'}
     onClick={()=>setOpen(v=>v==='general'?null:'general')}>
     <span><strong>Repertorio general</strong><small>{songs.length} canciones · ENGLISH / ESPAÑOL y más categorías</small></span>
     <b>{open==='general'?'−':'+'}</b>
    </button>
    {open==='general'&&<div className="a-rep-body">
     <h3>{editing?'Editar canción':'Añadir canción'}</h3>
     <form onSubmit={e=>void saveSong(e)} className="a-rep-fields">
      <input type="text" required value={form.title} placeholder="Nombre de la canción"
       onChange={e=>setForm(v=>({...v,title:e.target.value}))}/>
      <input type="text" value={form.artist} placeholder="Artista"
       onChange={e=>setForm(v=>({...v,artist:e.target.value}))}/>
      <input type="text" value={form.category} placeholder="ENGLISH o ESPAÑOL"
       onChange={e=>setForm(v=>({...v,category:e.target.value}))}/>
      <input type="text" value={form.referenceUrl} placeholder="Link de referencia · https://"
       onChange={e=>setForm(v=>({...v,referenceUrl:e.target.value}))}/>
      <label><input type="checkbox" checked={form.active}
       onChange={e=>setForm(v=>({...v,active:e.target.checked}))}/> Mostrar a músicos</label>
      <button type="submit" disabled={busy}>{editing?'Guardar cambios':'Añadir canción'}</button>
      {editing&&<button type="button" onClick={()=>{setEditing(null);setForm(empty());}}>Cancelar edición</button>}
     </form>
     <div className="a-rep-items">{songs.map(s=><div key={s.id} className="a-rep-item">
      <div><strong>{s.title}</strong><small>{s.category} · {s.artist||'Sin artista'} · {s.active?'Visible':'Oculta'}</small></div>
      <button type="button" disabled={busy} onClick={()=>{setEditing(s);setForm({title:s.title,artist:s.artist,
       category:s.category,referenceUrl:s.referenceUrl,position:s.position,active:s.active});}}>Editar</button>
      <button type="button" disabled={busy} onClick={()=>void removeSong(s)}>Eliminar</button>
     </div>)}</div>
    </div>}
   </article>
  </>}
 </section>;
}
