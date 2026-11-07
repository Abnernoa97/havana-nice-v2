import {useCallback,useEffect,useRef,useState} from 'react';
import {calendarDate,getCalendarEvents,HAVANA_V2_DEV_API_BASE_URL,safeCalendarMapUrl,type CalendarEvent} from '@havana/shared';
import {watchCalendar} from './services/calendar-live';
// Member token is provided by the existing V2 session. Never create another login.
export default function CalendarAccordion({token}:{token:string}){
 const [events,setEvents]=useState<CalendarEvent[]>([]);
 const [open,setOpen]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
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
  const update=()=>{if(!document.hidden&&navigator.onLine)void refresh();};
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
   events.map(item=><article key={item.id} className="hn-cal-event">
    <button type="button" className="hn-cal-event-head" aria-expanded={open===item.id}
     onClick={()=>setOpen(value=>value===item.id?null:item.id)}>
     <span><small>{calendarDate(item.date)}</small><strong>{item.title}</strong>
      {item.venue&&<span>{item.venue}</span>}</span>
     <b aria-hidden="true">{open===item.id?'−':'+'}</b>
    </button>
    {item.mapUrl&&(safeCalendarMapUrl(item.mapUrl)?<a className="hn-cal-maps" href={safeCalendarMapUrl(item.mapUrl)!} target="_blank"
     rel="noopener noreferrer">Llegar al evento · Google Maps ↗</a>:
     <p className="hn-cal-maps">Google Maps: {item.mapUrl}</p>)}
    {open===item.id&&<div className="hn-cal-details">
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
    </div>}
   </article>)}
 </section>;
}
