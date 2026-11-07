import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {getCalendarEvents,calendarDate,HAVANA_V2_DEV_API_BASE_URL,type CalendarEvent,type CalendarEventInput} from '@havana/shared';
import {adminMembers,adminCreateCalendarEvent,adminUpdateCalendarEvent,adminDeleteCalendarEvent,
 type AdminMember,isAdminUnauthorized} from '../../services/admin-api';
import {watchCalendar} from '../../services/calendar-live';
type Props={token:string;members:AdminMember[];onExpired:()=>void};
const empty=():CalendarEventInput=>({
 date:'',timeZone:'America/Mexico_City',title:'',venue:'',city:'',callTime:'',soundcheckTime:'',
 arrivalTime:'',showTime:'',endTime:'',wardrobe:'',details:'',contactName:'',
 contactPhone:'',notes:'',mapUrl:'',status:'confirmed',statusText:'',recipientIds:[]
});
// All user-editable fields are plain text; no pickers, masks, or suggestions.
const fields:[keyof CalendarEventInput,string][]=[
 ['title','Evento / nombre'],['date','Fecha'],['venue','Lugar / venue'],['city','Ciudad'],
 ['callTime','Hora de llamada'],['soundcheckTime','Prueba de sonido'],
 ['arrivalTime','Hora de llegada'],['showTime','Show'],['endTime','Hora de fin'],
 ['wardrobe','Vestuario'],['contactName','Contacto'],['contactPhone','Teléfono'],
 ['mapUrl','Google Maps'],['statusText','Estado']
];
export default function AdminCalendar({token,members,onExpired}:Props){
 const [events,setEvents]=useState<CalendarEvent[]>([]);
 const [roster,setRoster]=useState(members);
 const [form,setForm]=useState<CalendarEventInput>(empty);
 const [editing,setEditing]=useState<CalendarEvent|null>(null);
 const [draftOpen,setDraftOpen]=useState(false);
 const [expanded,setExpanded]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const requestId=useRef(0);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const active=roster.filter(p=>p.active===1);
 const refresh=useCallback(async()=>{
  // Calendar notifications supersede older HTTP responses (also during rapid edits).
  const request=++requestId.current;
  try{
   const [dates,people]=await Promise.all([
    getCalendarEvents(token,HAVANA_V2_DEV_API_BASE_URL,true),adminMembers(token)]);
   if(request!==requestId.current)return;
   setEvents(dates);setRoster(people.members);setError('');
  }catch(e){
   if(request!==requestId.current)return;
   if(isAdminUnauthorized(e))onExpired();
   else setError(e instanceof Error?e.message:'No fue posible cargar Calendario.');
  }finally{if(request===requestId.current)setLoading(false);}
 },[token,onExpired]);
 useEffect(()=>{
  const update=()=>{if(!document.hidden&&navigator.onLine)void refresh();};
  update();
  const stop=watchCalendar(token,true,update);
  return()=>{stop();requestId.current++;};
 },[token,refresh]);
 function change<K extends keyof CalendarEventInput>(key:K,value:CalendarEventInput[K]){
  setForm(old=>({...old,[key]:value}));
 }
 function startNew(){
  setForm({...empty(),recipientIds:active.map(p=>p.actor_id)});
  setEditing(null);setDraftOpen(true);setError('');setNotice('');
 }
 function edit(event:CalendarEvent){
  const {id,version,updatedAt,...content}=event;
  setForm({...content,recipientIds:event.recipientIds||[]});
  setEditing(event);setDraftOpen(true);setError('');setNotice('');
 }
 async function save(event:FormEvent){
  event.preventDefault();if(busy)return;
  if(!form.recipientIds.length){setError('Selecciona al menos un músico.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   if(editing)await adminUpdateCalendarEvent(token,editing.id,{...form,version:editing.version});
   else await adminCreateCalendarEvent(token,form);
   setNotice(editing?'Fecha y destinatarios actualizados.':'Fecha creada para los músicos seleccionados.');
   setDraftOpen(false);setEditing(null);await refresh();
  }catch(e){if(isAdminUnauthorized(e))onExpired();setError(e instanceof Error?e.message:'No se pudo guardar.');}
  finally{setBusy(false);}
 }
 async function remove(event:CalendarEvent){
  if(busy||!window.confirm('¿Eliminar definitivamente "'+event.title+'"? Se quitará del Calendario de los músicos.'))return;
  setBusy(true);setError('');setNotice('');
  try{
   await adminDeleteCalendarEvent(token,event.id,event.version);
   setNotice('Fecha eliminada.');setDraftOpen(false);setEditing(null);await refresh();
  }catch(e){if(isAdminUnauthorized(e))onExpired();setError(e instanceof Error?e.message:'No se pudo borrar.');}
  finally{setBusy(false);}
 }
 return <section className="a-panel a-calendar" aria-label="Calendario del Administrador">
  <div className="a-cal-toolbar">
   <div><h2>Calendario de eventos</h2><p className="a-detail">Crea cada fecha y elige quién la recibe.</p></div>
   <div className="a-cal-actions"><button type="button" onClick={()=>void refresh()} disabled={busy}>Actualizar</button>
    <button type="button" onClick={startNew} disabled={busy}>+ Nueva fecha</button></div>
  </div>
  {notice&&<p className="a-cal-notice" role="status">{notice}</p>}
  {error&&<p className="a-admin-error" role="alert">{error}</p>}
  {draftOpen&&<form className="a-cal-form" onSubmit={e=>void save(e)}>
   <h3>{editing?'Editar fecha':'Nueva fecha'}</h3>
   <div className="a-cal-fields">
    {fields.map(([key,label])=><label key={key} className="a-cal-field">
     <span>{label}</span><input type="text" value={String(form[key]??'')}
      required={key==='title'} autoComplete="off"
      onChange={e=>setForm(old=>({...old,[key]:e.target.value}))}/></label>)}
    <label className="a-cal-field a-cal-full"><span>Detalles</span>
     <textarea rows={3} value={form.details} onChange={e=>change('details',e.target.value)}/></label>
    <label className="a-cal-field a-cal-full"><span>Notas</span>
     <textarea rows={3} value={form.notes} onChange={e=>change('notes',e.target.value)}/></label>
   </div>
   <fieldset className="a-cal-recipients">
    <legend>Quién recibe esta fecha · {form.recipientIds.length} músico(s)</legend>
    <div className="a-cal-actions">
     <button type="button" onClick={()=>change('recipientIds',active.map(p=>p.actor_id))}>Todos</button>
     <button type="button" onClick={()=>change('recipientIds',[])}>Ninguno</button>
    </div>
    <div className="a-cal-recipients-grid">
     {active.map(p=><label key={p.actor_id} className="a-cal-person">
      <input type="checkbox" checked={form.recipientIds.includes(p.actor_id)}
       onChange={e=>change('recipientIds',e.target.checked?
        [...form.recipientIds,p.actor_id]:form.recipientIds.filter(id=>id!==p.actor_id))}/>
      <span>{p.display_name}</span>
     </label>)}
    </div>
    {!active.length&&<p>No hay músicos activos.</p>}
   </fieldset>
   <div className="a-cal-actions">
    <button type="submit" disabled={busy||!active.length}>{busy?'Guardando…':editing?'Guardar cambios':'Añadir al calendario'}</button>
    <button type="button" disabled={busy} onClick={()=>{setDraftOpen(false);setEditing(null);setError('');}}>Cancelar</button>
   </div>
  </form>}
  <div className="a-cal-list" aria-label="Todas las fechas">
   {loading?<p>Cargando fechas…</p>:!events.length?<p>No hay eventos en Calendario V2.</p>:
    events.map(item=><article key={item.id} className="a-cal-event">
     <button type="button" className="a-cal-summary"
      aria-expanded={expanded===item.id} onClick={()=>setExpanded(v=>v===item.id?null:item.id)}>
      <span><small>{calendarDate(item.date)}</small><strong>{item.title}</strong>
       <small>{item.venue||item.city||'Lugar por definir'} · {item.recipientIds?.length||0} músico(s)</small></span>
      <b aria-hidden="true">{expanded===item.id?'−':'+'}</b>
     </button>
     {expanded===item.id&&<div className="a-cal-event-body">
      <p>{[item.callTime&&'Llamada: '+item.callTime,item.soundcheckTime&&'Sonido: '+item.soundcheckTime,
       item.showTime&&'Show: '+item.showTime].filter(Boolean).join(' · ')}</p>
      {item.wardrobe&&<p>Vestuario: {item.wardrobe}</p>}
      {item.statusText&&<p>Estado: {item.statusText}</p>}
      <div className="a-cal-actions"><button type="button" onClick={()=>edit(item)}>Editar</button>
       <button type="button" className="a-cal-danger" onClick={()=>void remove(item)}>Borrar fecha</button></div>
     </div>}
    </article>)}
  </div>
 </section>;
}
