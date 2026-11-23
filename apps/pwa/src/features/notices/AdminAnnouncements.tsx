import {useCallback,useEffect,useState,type FormEvent} from 'react';
import {adminAnnouncements,adminSendAnnouncement,isAdminUnauthorized,type AdminMember,type AdminAnnouncement} from '../../services/admin-api';

export default function AdminAnnouncements({token,members,onExpired}:{
 token:string;members:AdminMember[];onExpired:()=>void;
}){
 const active=members.filter(item=>item.active===1);
 const [selected,setSelected]=useState<string[]>([]);
 const [message,setMessage]=useState('');
 const [link,setLink]=useState('');
 const [history,setHistory]=useState<AdminAnnouncement[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [success,setSuccess]=useState('');
 const refresh=useCallback(async()=>{
  try{setHistory((await adminAnnouncements(token)).items);}
  catch(e){if(isAdminUnauthorized(e))onExpired();else setError('No se pudo cargar el historial de avisos.');}
 },[token,onExpired]);
 useEffect(()=>{setSelected(active.map(item=>item.actor_id));},[members]);
 useEffect(()=>{void refresh();},[refresh]);
 const submit=async(event:FormEvent)=>{
  event.preventDefault();
  if(busy||!message.trim()||!selected.length)return;
  setBusy(true);setError('');setSuccess('');
  try{
   const result=await adminSendAnnouncement(token,{
    message:message.trim(),url:link.trim(),recipientIds:selected
   });
   setMessage('');setLink('');
   setSuccess('Aviso enviado a '+result.recipients+' integrante(s).');
   await refresh();
  }catch(e){
   if(isAdminUnauthorized(e))onExpired();
   setError(e instanceof Error?e.message:'No se pudo enviar la notificación.');
  }finally{setBusy(false);}
 };
 return <section className="a-panel hn-admin-notices" aria-label="Notificaciones para el equipo">
  <h2>Enviar notificación</h2>
  <form onSubmit={e=>void submit(e)}>
   <label htmlFor="hn-notice-message">Mensaje</label>
   <textarea id="hn-notice-message" rows={4} maxLength={160} required value={message}
    onChange={e=>setMessage(e.target.value)} placeholder="Escribe el aviso para los músicos…"/>
   <label htmlFor="hn-notice-url">Enlace (opcional)</label>
   <input id="hn-notice-url" type="url" inputMode="url" placeholder="https://"
    value={link} onChange={e=>setLink(e.target.value)}/>
   <div className="hn-admin-notice-head">
    <strong>Destinatarios · {selected.length}</strong>
    <div><button type="button" onClick={()=>setSelected(active.map(p=>p.actor_id))}>Todos</button>
     <button type="button" onClick={()=>setSelected([])}>Ninguno</button></div>
   </div>
   <div className="hn-admin-notice-recipients">
    {active.map(person=><label key={person.actor_id}>
      <input type="checkbox" checked={selected.includes(person.actor_id)}
       onChange={e=>setSelected(prev=>e.target.checked?[...prev,person.actor_id]:prev.filter(id=>id!==person.actor_id))}/>
      {person.display_name}
    </label>)}
   </div>
   <button className="hn-admin-notice-send" type="submit" disabled={busy||!message.trim()||selected.length===0}>
    {busy?'Enviando…':'Enviar notificación'}
   </button>
  </form>
  {error&&<p role="alert" className="a-admin-error">{error}</p>}
  {success&&<p role="status" className="a-cal-notice">{success}</p>}
  {!!history.length&&<div className="hn-admin-notice-history">
   <h3>Enviadas</h3>
   {history.map(item=><article key={item.broadcast_id}>
    <p>{item.message}</p>
    {item.url?.startsWith('https://')&&<a href={item.url} target="_blank" rel="noopener noreferrer">Abrir enlace</a>}
    <small>{new Date(item.createdAt).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})} · {item.recipients} destinatario(s)</small>
   </article>)}
  </div>}
 </section>;
}
