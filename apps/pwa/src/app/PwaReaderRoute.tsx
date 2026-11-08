import {lazy,Suspense,useEffect,useState} from 'react';
import {calendarEventCompleted,getCalendarEvents,HAVANA_V2_DEV_API_BASE_URL,
 type CalendarEvent,type PwaReaderTarget} from '@havana/shared';
const MemberBook=lazy(()=>import('../features/book/MemberBook'));
const CalendarMemories=lazy(()=>import('../features/calendar/CalendarMemories'));

// Dedicated view inside the EXISTING musician PWA session. No new login,
// browser token in a URL, server endpoint or PageFlip engine.
function EventMemoryReader({token,eventId}:{token:string;eventId:string}){
 const [event,setEvent]=useState<CalendarEvent|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;setLoading(true);setEvent(null);setError('');
  void getCalendarEvents(token,HAVANA_V2_DEV_API_BASE_URL).then(events=>{
   if(!active)return;
   setEvent(events.find(item=>item.id===eventId&&calendarEventCompleted(item))||null);
  }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'No se pudo consultar Calendario.');})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[token,eventId]);
 if(loading)return <p role="status">Buscando el recuerdo autorizado…</p>;
 if(error)return <p role="alert">{error}</p>;
 if(!event)return <p role="alert">Este recuerdo no está disponible para tu perfil.</p>;
 return <CalendarMemories token={token} eventId={event.id} title={event.title}
  photoCount={event.memoryCount||0}/>;
}
export default function PwaReaderRoute({token,route,onClose}:{
 token:string;route:PwaReaderTarget;onClose:()=>void
}){
 return <div className="visual-shell">
  <main className="visual-content" aria-label="Lector HAVANA NICE">
   <div className="visual-section-header">
    <button className="visual-back" type="button" onClick={onClose}>‹ Volver a Inicio</button>
    <span className="visual-overline">HAVANA NICE / LECTOR PRIVADO</span>
    <h1>{route.kind==='book'?'BOOK HAVANA NICE':'Recuerdos del evento'}</h1>
   </div>
   <Suspense fallback={<p role="status">Abriendo revista 3D…</p>}>
    {route.kind==='book'?<MemberBook token={token}/>:
     <EventMemoryReader token={token} eventId={route.eventId}/>}
   </Suspense>
  </main>
 </div>;
}
