import type {AdminMember,AdminMemberHistory,AdminDeletionPreview} from '../../services/admin-api';

// Render-only musician directory. Authentication, deletion, D1/R2 calls, realtime
// socket and refresh handlers are owned exclusively by AdminChatAccess.
type Props={
 members:AdminMember[];
 loaded:boolean;
 expanded:string;
 history:Record<string,AdminMemberHistory>;
 historyLoading:string;
 historyErrors:Record<string,string>;
 impact:Record<string,AdminDeletionPreview>;
 impactLoading:string;
 impactErrors:Record<string,string>;
 removing:string;
 busy:boolean;
 releaseBusy:string;
 onToggleMember:(person:AdminMember)=>void|Promise<void>;
 onRemoveMember:(person:AdminMember)=>void|Promise<void>;
 onReleaseInstallation:(person:AdminMember)=>void|Promise<void>;
 onInspectMemberData:(person:AdminMember)=>void|Promise<void>;
};

function MemberImpactSummary({name,preview}:{name:string;preview:AdminDeletionPreview}){
 const {counts}=preview;
 return <div className="a-member-impact-summary" role="status">
   <strong>Datos asociados a {name}</strong>
   <dl>
     <div><dt>Credenciales de acceso</dt><dd>{counts.sessions}</dd></div>
     <div><dt>Mensajes</dt><dd>{counts.messages}</dd></div>
     <div><dt>Reacciones</dt><dd>{counts.reactions}</dd></div>
     <div><dt>Lecturas</dt><dd>{counts.receipts}</dd></div>
     <div><dt>Historial</dt><dd>{counts.historyEvents}</dd></div>
     <div><dt>Archivos de Chat en R2</dt><dd>{counts.chatMedia}</dd></div>
     <div><dt>Fotos y vídeos de Familia en R2</dt><dd>{counts.familyMedia}</dd></div>
     <div><dt>Subidas pendientes de Familia</dt><dd>{counts.pendingUploads}</dd></div>
     <div><dt>Fechas asignadas en Calendario</dt><dd>{counts.calendarAssignments}</dd></div>
   </dl>
   <small>Las credenciales registradas no equivalen a teléfonos conectados en este momento. Las reacciones incluyen las vinculadas al músico o a sus mensajes.</small>
 </div>;
}



function groupedDays(events:AdminMemberHistory['events']){
 const days=new Map<string,AdminMemberHistory['events']>();
 for(const event of events){
  const day=new Date(event.occurred_at).toLocaleDateString('es-MX',{
   weekday:'long',day:'numeric',month:'long',year:'numeric'
  });
  days.set(day,[...(days.get(day)||[]),event]);
 }
 return [...days.entries()];
}
const modules:Record<string,string>={
 home:'Inicio',chat:'Chat',calendar:'Calendario',repertoire:'Repertorio',
 family:'Familia',audio:'Audio',notices:'Notificaciones',musicians:'Músicos'
};
function actionLabel(item:AdminMemberHistory['events'][number]):string{
 if(item.event_type==='module.open')return 'Abrió '+(modules[item.detail||'']||item.detail||'una sección');
 if(item.event_type==='audio.play')return 'Escuchó: '+(item.detail||'audio');
 if(item.event_type==='login')return 'Inició sesión';
 if(item.event_type==='connect')return 'Conectó al Chat';
 return 'Desconectó del Chat';
}

export default function AdminMemberDirectory({
 members,loaded,expanded,history,historyLoading,historyErrors,impact,impactLoading,
 impactErrors,removing,busy,releaseBusy,onToggleMember,onRemoveMember,
 onReleaseInstallation,onInspectMemberData,
}:Props){
 return (
   <section className="a-panel a-member-list">
     <div className="a-member-heading">
       <h2>Músicos autorizados</h2><span>{loaded?members.filter(person=>person.active===1).length:'—'}</span>
     </div>
     {!loaded?<p className="a-detail">Cargando integrantes…</p>:
       members.length===0?<p className="a-detail">Todavía no hay miembros registrados. Añade el primero arriba.</p>:
       <div className="a-member-rows">{members.map(person=><div className="a-member-group" key={person.actor_id}>
         <div className="a-member-row">
           <button type="button" className="a-member-expand" aria-expanded={expanded===person.actor_id}
             onClick={()=>void onToggleMember(person)}>
             <span className="a-member-avatar" aria-hidden="true">{person.display_name.charAt(0).toUpperCase()}</span>
             <span className="a-member-identity"><strong>{person.display_name}</strong><small>{person.active===1?'Autorizado':'Inactivo'}</small></span>
             <span className="a-member-chevron" aria-hidden="true">{expanded===person.actor_id?'⌃':'⌄'}</span>
           </button>
           <span className={person.active===1?'a-member-status on':'a-member-status'}>{person.active===1?'Activo':'Inactivo'}</span>
           <button type="button" className="a-member-delete" onClick={()=>void onRemoveMember(person)}
             disabled={!!removing||busy} title={'Eliminar definitivamente a '+person.display_name}
             aria-label={'Eliminar definitivamente a '+person.display_name}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
               <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/>
             </svg>
           </button>
         </div>
         {expanded===person.actor_id&&<div className="a-member-history">
           <h3>Actividad registrada</h3>
           {historyLoading===person.actor_id?<p>Cargando datos desde Cloudflare…</p>:
             historyErrors[person.actor_id]?<p className="a-admin-error" role="alert">{historyErrors[person.actor_id]}</p>:
             !history[person.actor_id]?<p>Sin datos de historial disponibles.</p>:
             <>
               <p className="a-member-count">Entradas registradas: <strong>{history[person.actor_id]?.entries ?? 0}</strong></p>
               {history[person.actor_id]?.events.length===0?
                 <p>Sin historial registrado. Las entradas anteriores a la activación de este registro no se pueden reconstruir.</p>:
                 <div className="a-member-events">
                  {groupedDays(history[person.actor_id]!.events).map(([day,events])=>
                   <section key={day} className="a-member-day">
                    <h4>{day}</h4>
                    {events.map((event,index)=><div className="a-member-event"
                     key={event.occurred_at+'-'+index}>
                     <strong>{actionLabel(event)} · {new Date(event.occurred_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</strong>
                     <span>{event.platform}{event.operating_system?' · '+event.operating_system:''}</span>
                     {event.device_name&&<span>{event.device_name}{event.device_model&&event.device_model!=='K'?' · '+event.device_model:''}</span>}
                    </div>)}
                   </section>)}
                 </div>}
               <small>{history[person.actor_id]?.since}</small>
             </>}
           <div className="a-member-impact">
               <div className="a-member-installation">
                 <strong>{person.installation_bound===1?'Dispositivo único vinculado':'Dispositivo aún sin vincular'}</strong>
                 <small>{person.installation_bound===1?
                   'Este nombre no puede iniciar sesión desde otro dispositivo. Los intentos se notificarán aquí.':
                   'El primer acceso a este nombre quedará vinculado a una sola instalación.'}</small>
                 {person.installation_bound===1&&<button type="button"
                   disabled={!!releaseBusy||!!removing} onClick={()=>void onReleaseInstallation(person)}>
                   {releaseBusy===person.actor_id?'Liberando…':'Liberar dispositivo'}
                 </button>}
               </div>

             <button type="button" onClick={()=>void onInspectMemberData(person)}
               disabled={impactLoading===person.actor_id||!!removing}
               aria-label={'Consultar datos asociados a '+person.display_name}>
               {impactLoading===person.actor_id?'Consultando Cloudflare…':'Ver datos asociados'}
             </button>
             {impactErrors[person.actor_id]&&<p className="a-admin-error" role="alert">{impactErrors[person.actor_id]}</p>}
             {impact[person.actor_id]&&<MemberImpactSummary
               name={person.display_name} preview={impact[person.actor_id]!}/>}
           </div>
         </div>}
       </div>)}</div>}
   </section>
 );
}
