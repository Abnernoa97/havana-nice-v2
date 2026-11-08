import {useCallback,useEffect,useRef,useState} from 'react';
import {watchRepertoire} from '../../services/calendar-live';
import {getCalendarEvents,HAVANA_V2_DEV_API_BASE_URL,getRepertoireSongs,getAssignedEventRepertoire,
 safeRepertoireLink,calendarDate,type RepertoireSong,type RepertoireEventItem,type CalendarEvent} from '@havana/shared';

export default function MemberRepertoire({token}:{token:string}){
 const [songs,setSongs]=useState<RepertoireSong[]>([]);
 const [events,setEvents]=useState<{event:CalendarEvent;items:RepertoireEventItem[]}[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [open,setOpen]=useState<string|null>(null);
 // Discard old results after a newer refresh, logout, token change or unmount.
 const requestId=useRef(0);
 const refresh=useCallback(async()=>{
  const request=++requestId.current;
  try{
   const [catalog,assigned,assignedItems]=await Promise.all([
    getRepertoireSongs(token),
    getCalendarEvents(token,HAVANA_V2_DEV_API_BASE_URL),
    getAssignedEventRepertoire(token)
   ]);
   if(request!==requestId.current)return;
   const byEvent=new Map<string,RepertoireEventItem[]>();
   for(const item of assignedItems){
    const list=byEvent.get(item.eventId)||[];
    list.push(item);byEvent.set(item.eventId,list);
   }
   setSongs(catalog);
   setEvents(assigned.filter(e=>byEvent.has(e.id)).map(event=>({
    event,items:byEvent.get(event.id)!
   })));
   setError('');
  }catch(e){
   if(request===requestId.current)
    setError(e instanceof Error?e.message:'No se pudo cargar Repertorio.');
  }finally{
   if(request===requestId.current)setLoading(false);
  }
 },[token]);
 useEffect(()=>{
  // A newly authorized session must never see rows from a previous user.
  setSongs([]);setEvents([]);setOpen(null);setLoading(true);setError('');
  const stop=watchRepertoire(token,false,()=>{if(!document.hidden&&navigator.onLine)void refresh();});
  return()=>{++requestId.current;stop();};
 },[refresh]);
 const categories=[...new Set(songs.map(s=>s.category))];
 return <section className="hn-repertoire" aria-label="Repertorio del equipo">
  <div className="hn-rep-toolbar"><strong>REPERTORIO DEL EQUIPO</strong>
   <button type="button" onClick={()=>void refresh()}>Actualizar</button></div>
  {!!error&&<p role="alert" className="hn-cal-error">{error}</p>}
  {loading?<p className="hn-cal-empty">Cargando repertorio…</p>:<>
   <h2>Repertorio general</h2>
   {songs.length===0?<p className="hn-cal-empty">El Administrador aún no ha añadido canciones.</p>:
    categories.map(cat=><div key={cat} className="hn-rep-group">
     <h3>{cat}</h3>
     {songs.filter(s=>s.category===cat).map(song=><article key={song.id} className="hn-rep-row">
      <div><strong>{song.title}</strong>{song.artist&&<small>{song.artist}</small>}</div>
      {safeRepertoireLink(song.referenceUrl)&&<a target="_blank" rel="noopener noreferrer"
       href={safeRepertoireLink(song.referenceUrl)!}>REVISAR LINK ↗</a>}
     </article>)}
    </div>)}
   <h2>Repertorio por evento</h2>
   {events.length===0?<p className="hn-cal-empty">Aún no tienes canciones asignadas por evento.</p>:
    events.map(({event,items})=><article key={event.id} className="hn-cal-event">
     <button type="button" className="hn-cal-event-head" aria-expanded={open===event.id}
      onClick={()=>setOpen(v=>v===event.id?null:event.id)}>
      <span><small>{calendarDate(event.date)}</small><strong>{event.title}</strong>
       <span>{items.filter(x=>x.completed).length} / {items.length} realizadas</span></span>
      <b aria-hidden="true">{open===event.id?'−':'+'}</b>
     </button>
     {open===event.id&&<div className="hn-cal-details">
      {items.map((item,i)=><div key={item.id} className="hn-rep-row">
       <div><strong>{i+1}. {item.title}</strong>
        {item.artist&&<small>{item.artist}</small>}
        <small>{item.completed?'✓ Realizada':item.songId?'Pendiente':'Especial · pendiente'}</small>
       </div>
       {safeRepertoireLink(item.referenceUrl)&&<a href={safeRepertoireLink(item.referenceUrl)!}
        target="_blank" rel="noopener noreferrer">REVISAR LINK ↗</a>}
      </div>)}
     </div>}
    </article>)}
  </>}
 </section>;
}
