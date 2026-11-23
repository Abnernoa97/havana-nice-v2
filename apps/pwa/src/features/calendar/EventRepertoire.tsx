import {useEffect,useState} from 'react';
import {getEventRepertoire,safeRepertoireLink,type RepertoireEventItem} from '@havana/shared';
import './event-repertoire.css';

// Event-specific D1 read lives with the event setlist. Calendar still owns its view.
function EventRepertoire({token,eventId,revision}:{token:string;eventId:string;revision:number}){
 const [items,setItems]=useState<RepertoireEventItem[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;setItems([]);setLoading(true);setError('');
  void getEventRepertoire(token,eventId).then(rows=>{if(alive)setItems(rows);})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:'No se pudo cargar el repertorio.');})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[token,eventId,revision]);
 return <section className="hn-cal-event-repertoire" aria-label="Repertorio de esta fecha">
  <h4>Repertorio del evento</h4>
  {loading?<p className="hn-cal-rep-note">Cargando canciones…</p>:
   error?<p className="hn-cal-error" role="alert">{error}</p>:
   !items.length?<p className="hn-cal-rep-note">Aún no hay canciones asignadas a esta fecha.</p>:<>
    <p className="hn-cal-rep-note">{items.filter(item=>item.completed).length} / {items.length} realizadas</p>
    {items.map((item,i)=><article key={item.id} className="hn-rep-row hn-cal-rep-row">
     <div><strong>{i+1}. {item.title}</strong>
      {item.artist&&<small>{item.artist}</small>}
      <small>{item.completed?'✓ Realizada':item.songId?'Pendiente':'Especial · pendiente'}</small></div>
     {safeRepertoireLink(item.referenceUrl)&&<a target="_blank" rel="noopener noreferrer"
      href={safeRepertoireLink(item.referenceUrl)!}>REVISAR LINK ↗</a>}
    </article>)}
   </>}
 </section>;
}
export default EventRepertoire;
