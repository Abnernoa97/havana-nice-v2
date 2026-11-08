import {lazy,Suspense,useCallback,useEffect,useRef,useState} from 'react';
import {calendarDate,calendarEventCompleted,getCalendarEvents,HAVANA_V2_DEV_API_BASE_URL,safeCalendarMapUrl,type CalendarEvent} from '@havana/shared';
const CalendarMemories=lazy(()=>import('./CalendarMemories'));
import './calendar-memories.css';
import {watchCalendar} from '../../services/calendar-live';
// Member token is provided by the existing V2 session. Never create another login.
export default function CalendarAccordion({token}:{token:string}){
 const [events,setEvents]=useState<CalendarEvent[]>([]);
 const [open,setOpen]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [revision,setRevision]=useState(0);
 const pending=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  // A server invalidation outranks any older in-flight response.
  pending.current?.abort();
  const controller=new AbortController();
  pending.current=controller;
  try{
   const dates=await getCalendarEvents(token,HAVANA_V2_DEV_API_BASE_URL,false,controller.signal);
   if(!controller.signal.aborted){setEvents(dates);setError('');}
  }catch(e){
   if(!controller.signal.aborted)
    setError(e instanceof Error?e.message:'No se pudo cargar Calendario.');
  }finally{
   if(pending.current===controller){
    pending.current=null;
    if(!controller.signal.aborted)setLoading(false);
   }
  }
 },[token]);
 useEffect(()=>{
  const update=(reason?:'fallback')=>{if(!document.hidden&&navigator.onLine){if(reason!=='fallback')setRevision(n=>n+1);void refresh();}};
  update();
  const stop=watchCalendar(token,false,update);
  return()=>{stop();pending.current?.abort();pending.current=null;};
 },[token,refresh]);
 return <section className="hn-cal-list" aria-label="Fechas de trabajo">
  <div className="hn-cal-bar"><strong>Eventos · Fechas de trabajo</strong>
   <button type="button" onClick={()=>void refresh()}>Actualizar</button></div>
  {error&&<p role="alert" className="hn-cal-error">{error}</p>}
  {loading?<p className="hn-cal-empty">Cargando tus fechas…</p>:!events.length?
   <p className="hn-cal-empty">No tienes eventos asignados.</p>:
   events.map(item=>{const past=calendarEventCompleted(item);return <article key={item.id} className={'hn-cal-event'+(past?' hn-cal-completed':'')}>
    <button type="button" className="hn-cal-event-head" aria-expanded={open===item.id}
     onClick={()=>setOpen(value=>value===item.id?null:item.id)}>
     <span className="hn-cal-summary-main"><small>{calendarDate(item.date)}</small><strong>{item.title}</strong>
      {item.venue&&<span>{item.venue}</span>}
      {past?<span className="hn-cal-stamp" aria-label="Evento realizado">EVENTO REALIZADO</span>:null}
     </span>
     <b aria-hidden="true">{open===item.id?'−':'+'}</b>
    </button>
    {!past&&item.mapUrl&&(safeCalendarMapUrl(item.mapUrl)?<a className="hn-cal-maps" href={safeCalendarMapUrl(item.mapUrl)!} target="_blank"
     rel="noopener noreferrer">Llegar al evento · Google Maps ↗</a>:
     <p className="hn-cal-maps">Google Maps: {item.mapUrl}</p>)}
    {open===item.id&&(past?<div className="hn-cal-memory-sheet">
     <div className="hn-cal-memory-heading"><span>HAVANA NICE / ARCHIVO DE EVENTOS</span>
      <strong>Ficha del evento</strong></div>
     <dl className="hn-cal-memory-facts">
      <div><dt>Fecha</dt><dd>{calendarDate(item.date)}</dd></div>
      <div><dt>Evento</dt><dd>{item.title}</dd></div>
      {(item.venue||item.city)?<div><dt>Lugar</dt><dd>{[item.venue,item.city].filter(Boolean).join(' · ')}</dd></div>:null}
      {item.showTime?<div><dt>Presentación</dt><dd>{item.showTime}</dd></div>:null}
     </dl>
     <div className="hn-cal-memory-photos"><h4>Recuerdos de este día</h4>
      <Suspense fallback={<p className="hn-cal-memory-placeholder" role="status">Abriendo recuerdos…</p>}><CalendarMemories token={token} eventId={item.id} title={item.title} revision={revision} photoCount={item.memoryCount||0}/></Suspense>
     </div>
    </div>:<div className="hn-cal-details">
     <div className="hn-cal-hours">
      {([['Llamada',item.callTime],['Sonido',item.soundcheckTime],['Llegada',item.arrivalTime],
       ['Show',item.showTime],['Fin',item.endTime]] as [string,string][]).filter(([,v])=>!!v)
       .map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}
     </div>
     {item.wardrobe&&<p><b>Vestuario: </b>{item.wardrobe}</p>}
     {item.details&&<p>{item.details}</p>}
     {item.contactName&&<p><b>Contacto: </b>{item.contactName}{item.contactPhone&&' · '+item.contactPhone}</p>}
     {item.notes&&<p><b>Notas: </b>{item.notes}</p>}
     {(item.statusText||item.status!=='confirmed')&&<p><b>Estado: </b>{item.statusText|| (item.status==='tentative'?'Tentativo':'Cancelado')}</p>}
    </div>)}
   </article>})}
 </section>;
}
