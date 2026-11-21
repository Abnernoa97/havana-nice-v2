import {useCallback,useEffect,useRef,useState} from 'react';
import {getMemberNotices,markMemberNoticesRead,memberNoticeMessage,
 type MemberNotice,MemberNoticeApiError} from '@havana/shared';
import {useFamilyLive} from '../../services/use-family-live';
import './member-notices.css';

export default function MemberNotices({token}:{token:string}){
 const [items,setItems]=useState<MemberNotice[]>([]);
 const [unread,setUnread]=useState(0);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const request=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++request.current;
  try{
   const inbox=await getMemberNotices(token);
   if(id!==request.current)return;
   setItems(inbox.items);setUnread(inbox.unread);setError('');
  }catch(e){
   if(id!==request.current)return;
   setError(e instanceof MemberNoticeApiError&&e.status===404?
    'El centro de notificaciones está pendiente de activación.':
    e instanceof Error?e.message:'Notificaciones temporalmente no disponibles.');
  }finally{if(id===request.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setItems([]);setLoading(true);void refresh();
  return()=>{++request.current;};
 },[refresh]);
 // Reuse the authenticated Familia invalidation socket only on this active tab.
 useFamilyLive(token,false,()=>{void refresh();});
 const mark=async(id?:string)=>{
  try{await markMemberNoticesRead(token,id);await refresh();}
  catch(e){setError(e instanceof Error?e.message:'No se pudo marcar como leído.');}
 };
 return <section className="hn-notices" aria-label="Notificaciones privadas del equipo">
  <div className="hn-notices-header">
   <div><h2>Tu actividad</h2><p>{unread} {unread===1?'notificación nueva':'notificaciones nuevas'}</p></div>
   <button type="button" onClick={()=>void refresh()}>Actualizar</button>
  </div>
  {unread>0&&<button className="hn-notices-readall" type="button"
   onClick={()=>void mark()}>Marcar todas como leídas</button>}
  {error&&<p className="hn-notices-error" role="alert">{error}</p>}
  {loading?<p className="hn-notices-empty" role="status">Cargando actividad…</p>:
   !items.length?<p className="hn-notices-empty">Aquí aparecerán las reacciones, comentarios y avisos que recibas.</p>:
   <div className="hn-notices-list">
    {items.map(item=><article key={item.id}
     className={'hn-notice'+(item.readAt?'':' hn-notice-unread')}>
     <div className="hn-notice-dot" aria-hidden="true">{item.readAt?'':'•'}</div>
     <div className="hn-notice-copy">
      <strong>{memberNoticeMessage(item)}</strong>
      {item.preview&&<p>{item.preview}</p>}
      <small>{new Date(item.createdAt).toLocaleString('es-MX',
       {dateStyle:'medium',timeStyle:'short'})}</small>
     </div>
     {!item.readAt&&<button type="button" aria-label={'Marcar como leída: '+item.name}
      onClick={()=>void mark(item.id)}>Leída</button>}
    </article>)}
   </div>}
 </section>;
}
