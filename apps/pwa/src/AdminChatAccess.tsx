import {useCallback,useEffect,useState,type FormEvent} from 'react';
import AdminChatGeneral from './AdminChatGeneral';
import AdminCalendar from './AdminCalendar';
import AdminRepertoire from './AdminRepertoire';
import AdminFamily from './AdminFamily';
import {adminAvailability,adminLogin,adminLogout,adminVerify,adminOtherSessions,adminRevokeOtherSessions,adminMembers,adminCreateMember,adminMemberHistory,adminDeletionPreview,adminRemoveMember,adminDuplicateLogins,adminReviewDuplicateLogin,adminReleaseInstallation,openAdminRealtime,
 type AdminSession,type AdminMember,type AdminMemberHistory,type AdminDeletionPreview,type AdminDuplicateLoginAlert,type AdminChatStreamEvent,isAdminUnauthorized} from './admin-api';

type Section='access'|'chat'|'repertoire'|'calendar'|'family'|'more';
type Readiness='loading'|'disabled'|'enabled'|'error';

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
   </dl>
   <small>Las credenciales registradas no equivalen a teléfonos conectados en este momento. Las reacciones incluyen las vinculadas al músico o a sus mensajes.</small>
 </div>;
}

export default function AdminChatAccess({section}:{section:Section}){
 const [readiness,setReadiness]=useState<Readiness>('loading');
 const [session,setSession]=useState<AdminSession|null>(null);
 const [password,setPassword]=useState('');
 const [name,setName]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [members,setMembers]=useState<AdminMember[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [expanded,setExpanded]=useState('');
 const [history,setHistory]=useState<Record<string,AdminMemberHistory>>({});
 const [historyLoading,setHistoryLoading]=useState('');
 const [historyErrors,setHistoryErrors]=useState<Record<string,string>>({});
 const [impact,setImpact]=useState<Record<string,AdminDeletionPreview>>({});
 const [impactLoading,setImpactLoading]=useState('');
 const [impactErrors,setImpactErrors]=useState<Record<string,string>>({});
 const [removing,setRemoving]=useState('');
 const [otherSessions,setOtherSessions]=useState<number|null>(null);
 const [sessionsBusy,setSessionsBusy]=useState(false);
 const [duplicateAlerts,setDuplicateAlerts]=useState<AdminDuplicateLoginAlert[]>([]);
 const [duplicateBusy,setDuplicateBusy]=useState('');
 const [releaseBusy,setReleaseBusy]=useState('');
 const [realtime,setRealtime]=useState<'waiting'|'connected'|'reconnecting'>('waiting');
 const [chatEvent,setChatEvent]=useState<AdminChatStreamEvent|null>(null);
 const onChatExpired=useCallback(()=>{setSession(null);setError('Tu sesión administrativa expiró.');},[]);
 // Prevent frontend updates from interrupting authorized admin sessions.
 // The marker contains no credential; actual tokens stay in React memory only.
 useEffect(()=>{
   document.documentElement.dataset.adminSessionActive=session?'true':'false';
   if(!session)window.dispatchEvent(new Event('havana-admin-session-ended'));
   return()=>{document.documentElement.dataset.adminSessionActive='false';};
 },[session]);

 const refreshDuplicateAlerts=useCallback(async(token:string)=>{
   try{
     const data=await adminDuplicateLogins(token);
     setDuplicateAlerts(data.alerts);
   }catch(reason){
     if(isAdminUnauthorized(reason)){setSession(null);setError('Tu sesión de Administrador expiró.');}
     else if(reason instanceof Error && 'status' in reason && reason.status===404) {
       // Backend and Pages are deployed separately. A staged UI update must
       // not disturb the already-authorized Administrator session.
       setDuplicateAlerts([]);
     }else setError('No se pudieron actualizar las alertas de acceso.');
   }
 },[]);
 const refreshOtherSessions=useCallback(async(token:string)=>{
   try{
     const data=await adminOtherSessions(token);
     setOtherSessions(data.others);
   }catch(reason){
     if(isAdminUnauthorized(reason)){setSession(null);setError('Tu sesión de Administrador expiró.');}
     else setOtherSessions(null);
   }
 },[]);
 const refreshMembers=useCallback(async(token:string)=>{
   try{const data=await adminMembers(token);setMembers(data.members);setLoaded(true);}
   catch(e){
     if(isAdminUnauthorized(e)){setSession(null);setError('Tu sesión de Administrador expiró.');return;}
     setError('No se pudo actualizar la lista. Comprueba tu conexión; conservamos la sesión y los datos cargados.');
   }
 },[]);
 useEffect(()=>{
   let active=true;
   void adminAvailability().then(result=>{if(active)setReadiness(result.enabled?'enabled':'disabled');})
     .catch(()=>{if(active)setReadiness('error');});
   return()=>{active=false;};
 },[]);
 useEffect(()=>{
   if(!session)return;
   const expiry=Date.parse(session.expiresAt);
   if(!Number.isFinite(expiry)||expiry<=Date.now()){setSession(null);return;}
   void adminVerify(session.token).then(()=>{
     void refreshMembers(session.token);
     void refreshOtherSessions(session.token);
     void refreshDuplicateAlerts(session.token);
   }).catch(reason=>{
     if(isAdminUnauthorized(reason)){setSession(null);setError('Tu sesión de Administrador expiró.');}
     else setError('No se pudo verificar la conexión. Tu sesión permanece abierta para reintentar.');
   });
 },[session,refreshMembers,refreshOtherSessions,refreshDuplicateAlerts]);
 useEffect(()=>{
   if(!session){setRealtime('waiting');return;}
   let active=true,socket:WebSocket|null=null,timer:ReturnType<typeof setTimeout>|null=null;
   let retry=1000;
   const clearRetry=()=>{
     if(timer!==null){clearTimeout(timer);timer=null;}
   };
   const reconnect=()=>{
     if(!active||document.hidden||!navigator.onLine)return;
     // One Admin socket at a time: avoid duplicates when online/foreground fires
     // while a connection is still opening or an old close event is pending.
     if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING))return;
     clearRetry();
     setRealtime('reconnecting');
     try{
       const opened=openAdminRealtime(session.token,event=>{
         if(!active||socket!==opened)return;
         if(event.type==='admin.ready'){retry=1000;setRealtime('connected');void refreshMembers(session.token);void refreshOtherSessions(session.token);void refreshDuplicateAlerts(session.token);}
         if(event.type==='admin.invalidate'&&event.topic==='members'){void refreshMembers(session.token);void refreshDuplicateAlerts(session.token);}
         if(event.type.startsWith('admin.chat.'))setChatEvent(event as AdminChatStreamEvent);
       });
       socket=opened;
       opened.onclose=e=>{
         // Ignore a stale socket closed by offline/background transitions.
         if(!active||socket!==opened)return;
         socket=null;
         setRealtime('reconnecting');
         if(e.code===4003){setSession(null);setError('Tu sesión administrativa fue revocada.');return;}
         if(!document.hidden&&navigator.onLine){
           clearRetry();
           timer=setTimeout(()=>{timer=null;reconnect();},retry);
           retry=Math.min(15000,retry*2);
         }
       };
       opened.onerror=()=>{if(active&&socket===opened)setRealtime('reconnecting');};
     }catch{
       if(active&&!document.hidden&&navigator.onLine){
         clearRetry();
         timer=setTimeout(()=>{timer=null;reconnect();},retry);
         retry=Math.min(15000,retry*2);
       }
     }
   };
   const resume=()=>{
     if(!active)return;
     if(document.hidden||!navigator.onLine){
       clearRetry();
       const previous=socket;
       socket=null; // The next foreground/online event may connect immediately.
       if(previous&&previous.readyState!==WebSocket.CLOSED)previous.close();
       setRealtime('reconnecting');
       return;
     }
     void adminVerify(session.token).then(()=>{void refreshMembers(session.token);void refreshOtherSessions(session.token);void refreshDuplicateAlerts(session.token);}).catch(reason=>{
       if(!active)return;
       if(isAdminUnauthorized(reason)){setSession(null);setError('Tu sesión administrativa expiró.');}
       else setError('Sin conexión temporal. La sesión sigue abierta; se actualizará al reconectar.');
     });
     if(!socket||socket.readyState===WebSocket.CLOSING||socket.readyState===WebSocket.CLOSED){
       socket=null;
       reconnect();
     }
   };
   const duration=Math.max(0,Date.parse(session.expiresAt)-Date.now());
   const expiryTimer=setTimeout(()=>{if(active){setSession(null);setError('La sesión administrativa expiró.');}},duration);
   document.addEventListener('visibilitychange',resume);
   window.addEventListener('online',resume);
   window.addEventListener('offline',resume);
   reconnect();
   return()=>{
     active=false;clearTimeout(expiryTimer);if(timer)clearTimeout(timer);
     document.removeEventListener('visibilitychange',resume);
     window.removeEventListener('online',resume);
     window.removeEventListener('offline',resume);
     socket?.close();
   };
 },[session,refreshMembers,refreshOtherSessions,refreshDuplicateAlerts]);
 async function login(event:FormEvent){
   event.preventDefault();if(busy||!password)return;
   setBusy(true);setError('');
   try{const next=await adminLogin(password);setPassword('');setSession(next);}
   catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar sesión');}
   finally{setBusy(false);}
 }
 async function logout(){
   if(!session)return;
   const token=session.token;
   setSession(null);setMembers([]);setLoaded(false);setError('');setNotice('');setName('');setOtherSessions(null);
   setExpanded('');setHistory({});setHistoryErrors({});setImpact({});setImpactErrors({});setDuplicateAlerts([]);
   try{await adminLogout(token);}catch{/* In-memory session is discarded even when offline. */}
 }
 async function toggleMember(person:AdminMember){
   if(expanded===person.actor_id){setExpanded('');return;}
   setExpanded(person.actor_id);
   if(!session)return;
   setHistoryLoading(person.actor_id);
   setHistory(previous=>{const next={...previous};delete next[person.actor_id];return next;});
   setHistoryErrors(previous=>{const next={...previous};delete next[person.actor_id];return next;});
   try{
     const value=await adminMemberHistory(session.token,person.actor_id);
     setHistory(previous=>({...previous,[person.actor_id]:value}));
   }catch{
     setHistoryErrors(previous=>({...previous,[person.actor_id]:'No se pudo consultar el historial en Cloudflare. Cierra y vuelve a abrir para reintentar.'}));
   }finally{setHistoryLoading(current=>current===person.actor_id?'':current);}
 }
 // A separate, strictly read-only audit: no trash action and no mutation.
 // The Administrator can inspect real D1 counts without taking any risk.
 async function inspectMemberData(person:AdminMember){
   if(!session||impactLoading)return;
   setImpactLoading(person.actor_id);
   setImpact(previous=>{const next={...previous};delete next[person.actor_id];return next;});
   setImpactErrors(previous=>{const next={...previous};delete next[person.actor_id];return next;});
   try{
     const value=await adminDeletionPreview(session.token,person.actor_id);
     if(value.displayName!==person.display_name)throw new Error('El nombre cambió. Actualiza la lista.');
     setImpact(previous=>({...previous,[person.actor_id]:value}));
   }catch(reason){
     setImpactErrors(previous=>({...previous,[person.actor_id]:isAdminUnauthorized(reason)
       ?'La sesión expiró; vuelve a iniciar sesión.'
       :'No se pudieron consultar los datos en Cloudflare. Vuelve a intentar.'}));
     if(isAdminUnauthorized(reason))setSession(null);
   }finally{setImpactLoading(current=>current===person.actor_id?'':current);}
 }
 async function removeMember(person:AdminMember){
   if(!session||removing||busy)return;
   setRemoving(person.actor_id);setError('');setNotice('');
   try{
     // Read the authoritative D1 impact BEFORE asking for irrevocable removal.
     // Fail closed: no preview, no deletion.
     const preview=await adminDeletionPreview(session.token,person.actor_id);
     if(preview.displayName!==person.display_name)throw new Error('El nombre cambió. Actualiza la lista antes de eliminar.');
     if(!preview.canDelete)
       throw new Error('No se permite eliminar este músico en este momento.');
     const counts=preview.counts;
     const approved=window.confirm(
       '¿Eliminar DEFINITIVAMENTE a '+person.display_name+'?\n\n'+
       'Se eliminarán de Cloudflare:\n'+
       '· Sesiones: '+counts.sessions+'\n'+
       '· Mensajes propios: '+counts.messages+'\n'+
       '· Reacciones: '+counts.reactions+'\n'+
       '· Lecturas: '+counts.receipts+'\n'+
       '· Eventos de historial: '+counts.historyEvents+'\n'+
       '\n'+
       'Se cerrarán sus conexiones activas. Esta acción NO se puede deshacer.'
     );
     if(!approved)return;
     await adminRemoveMember(session.token,person.actor_id,person.display_name);
     // Only after the server confirms deletion, update local roster.
     setMembers(previous=>previous.filter(item=>item.actor_id!==person.actor_id));
     setHistory(previous=>{const next={...previous};delete next[person.actor_id];return next;});
     setImpact(previous=>{const next={...previous};delete next[person.actor_id];return next;});
     if(expanded===person.actor_id)setExpanded('');
     await refreshMembers(session.token);
     setNotice('Miembro eliminado definitivamente: '+person.display_name);
   }catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar el miembro');}
   finally{setRemoving('');}
 }
 async function closeOtherSessions(){
   if(!session||sessionsBusy||!otherSessions)return;
   if(!window.confirm('¿Cerrar las otras '+otherSessions+' sesiones administrativas? Tu sesión actual seguirá abierta.'))return;
   setSessionsBusy(true);setError('');setNotice('');
   try{
     const result=await adminRevokeOtherSessions(session.token);
     setOtherSessions(0);
     setNotice('Otras sesiones administrativas cerradas: '+result.revoked+'. Esta sesión continúa activa.');
   }catch(e){setError(e instanceof Error?e.message:'No se pudieron cerrar otras sesiones');}
   finally{setSessionsBusy(false);}
 }
 async function reviewDuplicateAlert(id:string){
   if(!session||duplicateBusy)return;
   setDuplicateBusy(id);
   try{
     await adminReviewDuplicateLogin(session.token,id);
     setDuplicateAlerts(previous=>previous.map(a=>a.id===id?{...a,reviewed_at:Date.now()}:a));
   }catch(reason){setError(reason instanceof Error?reason.message:'No se pudo marcar la alerta');}
   finally{setDuplicateBusy('');}
 }
 async function releaseInstallation(person:AdminMember){
   if(!session||releaseBusy||person.installation_bound!==1)return;
   if(!window.confirm(
     '¿Liberar el dispositivo vinculado a '+person.display_name+'?\n\n'+
     'Se cerrarán sus sesiones actuales. El primer dispositivo que vuelva a entrar con este nombre podrá vincularse. '+
     'No se borrarán sus mensajes, reacciones ni historial.'
   ))return;
   setReleaseBusy(person.actor_id);setError('');setNotice('');
   try{
     const result=await adminReleaseInstallation(session.token,person.actor_id,person.display_name);
     setMembers(previous=>previous.map(m=>m.actor_id===person.actor_id?{...m,installation_bound:0,session_count:0}:m));
     setNotice('Dispositivo de '+person.display_name+' liberado. Credenciales cerradas: '+result.revokedSessions+'.');
     void refreshMembers(session.token);
   }catch(reason){setError(reason instanceof Error?reason.message:'No se pudo liberar el dispositivo');}
   finally{setReleaseBusy('');}
 }
 async function addMember(event:FormEvent){
   event.preventDefault();if(!session||busy||!name.trim())return;
   setBusy(true);setError('');setNotice('');
   try{
     const result=await adminCreateMember(session.token,name.trim());
     // Confirmed by D1: keep the new member visible if a follow-up GET fails.
     setMembers(previous=>previous.some(item=>item.actor_id===result.member.actor_id)
       ?previous:[...previous,result.member].sort((a,b)=>a.display_name.localeCompare(b.display_name,'es')));
     setLoaded(true);
     setName('');
     setNotice('Nombre autorizado: '+result.member.display_name);
     await refreshMembers(session.token);
   }catch(e){setError(e instanceof Error?e.message:'No se pudo añadir el miembro');}
   finally{setBusy(false);}
 }
 // Keep the Administrator's verified session when changing navigation sections.
 if(section!=='access'&&section!=='chat'&&section!=='calendar'&&section!=='repertoire'&&section!=='family')return null;
 if(readiness==='loading')return <section className="a-panel">Comprobando el acceso administrativo…</section>;
 if(readiness!=='enabled')return <section className="a-panel">
   <h2>Acceso de Administrador</h2>
   <p className="a-detail">{readiness==='disabled'?'Acceso administrativo todavía no configurado.':'No se pudo verificar la conexión al Administrador.'}</p>
 </section>;
 if(!session)return <section className="a-panel a-admin-lock">
   <h2>Entrar al Administrador</h2>
   <p className="a-detail">Inicia sesión para crear y autorizar músicos. La contraseña no se guarda en el teléfono.</p>
   <form className="a-admin-login" onSubmit={login}>
     <label htmlFor="admin-password">Contraseña de Administrador</label>
     <input id="admin-password" type="password" autoComplete="off" value={password}
       onChange={event=>setPassword(event.target.value)} required minLength={8} maxLength={256}/>
     <button type="submit" disabled={busy}>{busy?'Verificando…':'Entrar'}</button>
   </form>
   {error&&<p role="alert" className="a-admin-error">{error}</p>}
 </section>;
 if(section==='calendar')return <AdminCalendar token={session.token} members={members} onExpired={onChatExpired}/>;
 if(section==='repertoire')return <AdminRepertoire token={session.token} onExpired={onChatExpired}/>;
 if(section==='family')return <AdminFamily token={session.token} onExpired={onChatExpired}/>;
 if(section==='chat')return <>
  <AdminChatGeneral token={session.token} connected={realtime==='connected'} liveEvent={chatEvent} onExpired={onChatExpired}/>
 </>;
 return <div className="a-access-workspace">
   <section className="a-panel a-admin-private">
     <div className="a-admin-toolbar">
       <div><h2>Administrador autorizado</h2>
         <p className="a-detail">{realtime==='connected'?'Sincronización automática activa':'Conectando con Cloudflare…'}</p></div>
       <div className="a-admin-toolbar-actions">
         <button type="button" onClick={()=>{void refreshMembers(session.token);void refreshOtherSessions(session.token);void refreshDuplicateAlerts(session.token);}}>Actualizar</button>
         <button type="button" onClick={()=>void logout()}>Cerrar sesión</button>
       </div>
     </div>
     <div className="a-admin-session-security">
       <span>Otras sesiones administrativas: <strong>{otherSessions===null?'Verificando…':otherSessions}</strong></span>
       {otherSessions!==null&&otherSessions>0&&<button type="button"
          disabled={sessionsBusy} onClick={()=>void closeOtherSessions()}>
          {sessionsBusy?'Cerrando…':'Cerrar otras sesiones'}
       </button>}
     </div>
   </section>
   {duplicateAlerts.some(a=>a.reviewed_at===null)&&<section className="a-panel a-admin-duplicate-alerts" role="region" aria-label="Intentos de acceso duplicado">
     <h2><span aria-hidden="true">⚠</span> Intentos de acceso duplicado</h2>
     <p className="a-detail">Otro dispositivo intentó entrar con un nombre ya vinculado. Su acceso fue rechazado.</p>
     {duplicateAlerts.filter(a=>a.reviewed_at===null).map(a=><div className="a-duplicate-alert" key={a.id}>
       <div><strong>{a.display_name}</strong>
         <small>{new Date(a.attempted_at).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})}</small>
         <small>{a.platform} · {a.operating_system} · {a.device_name}</small>
       </div>
       <button type="button" disabled={duplicateBusy===a.id} onClick={()=>void reviewDuplicateAlert(a.id)}>
         {duplicateBusy===a.id?'Guardando…':'Marcar revisada'}
       </button>
     </div>)}
     {duplicateAlerts.filter(a=>a.reviewed_at===null).length===60&&<small>Se muestran las 60 alertas más recientes. El historial continúa en Cloudflare.</small>}
   </section>}
   <section className="a-panel a-member-add">
     <h2>Añadir miembro</h2>
     <p className="a-detail">Solo los nombres creados aquí podrán entrar al Chat. Los músicos nuevos vincularán su primer dispositivo automáticamente, sin claves ni aprobaciones adicionales.</p>
     <form className="a-member-form" onSubmit={addMember}>
       <label htmlFor="new-musician-name">Nombre del músico</label>
       <input id="new-musician-name" type="text" value={name}
         onChange={event=>setName(event.target.value)} autoCapitalize="words"
         autoCorrect="off" maxLength={28} placeholder="Ej. María José" required/>
       <button type="submit" disabled={busy||!name.trim()}>{busy?'Guardando…':'Añadir y autorizar'}</button>
     </form>
     {notice&&<p className="a-member-notice" role="status">{notice}</p>}
     {error&&<p className="a-admin-error" role="alert">{error}</p>}
   </section>
   <section className="a-panel a-member-list">
     <div className="a-member-heading">
       <h2>Músicos autorizados</h2><span>{loaded?members.filter(person=>person.active===1).length:'—'}</span>
     </div>
     {!loaded?<p className="a-detail">Cargando integrantes…</p>:
       members.length===0?<p className="a-detail">Todavía no hay miembros registrados. Añade el primero arriba.</p>:
       <div className="a-member-rows">{members.map(person=><div className="a-member-group" key={person.actor_id}>
         <div className="a-member-row">
           <button type="button" className="a-member-expand" aria-expanded={expanded===person.actor_id}
             onClick={()=>void toggleMember(person)}>
             <span className="a-member-avatar" aria-hidden="true">{person.display_name.charAt(0).toUpperCase()}</span>
             <span className="a-member-identity"><strong>{person.display_name}</strong><small>{person.active===1?'Autorizado':'Inactivo'}</small></span>
             <span className="a-member-chevron" aria-hidden="true">{expanded===person.actor_id?'⌃':'⌄'}</span>
           </button>
           <span className={person.active===1?'a-member-status on':'a-member-status'}>{person.active===1?'Activo':'Inactivo'}</span>
           <button type="button" className="a-member-delete" onClick={()=>void removeMember(person)}
             disabled={!!removing||busy} title={'Eliminar definitivamente a '+person.display_name}
             aria-label={'Eliminar definitivamente a '+person.display_name}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
               <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/>
             </svg>
           </button>
         </div>
         {expanded===person.actor_id&&<div className="a-member-history">
           <h3>Historial de accesos</h3>
           {historyLoading===person.actor_id?<p>Cargando datos desde Cloudflare…</p>:
             historyErrors[person.actor_id]?<p className="a-admin-error" role="alert">{historyErrors[person.actor_id]}</p>:
             !history[person.actor_id]?<p>Sin datos de historial disponibles.</p>:
             <>
               <p className="a-member-count">Entradas registradas: <strong>{history[person.actor_id]?.entries ?? 0}</strong></p>
               {history[person.actor_id]?.events.length===0?
                 <p>Sin historial registrado. Las entradas anteriores a la activación de este registro no se pueden reconstruir.</p>:
                 <div className="a-member-events">{history[person.actor_id]?.events.map((event,index)=>
                   <div className="a-member-event" key={event.occurred_at+'-'+index}>
                     <strong>{event.event_type==='login'?'Entrada':event.event_type==='connect'?'Conectó al Chat':'Desconectó del Chat'} · {new Date(event.occurred_at).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})}</strong>
                     <span>{event.platform} · {event.device_model==='K'&&event.operating_system==='Android 10'?'Android (versión no disponible)':event.operating_system}</span>
                     <span>{event.device_name}{event.device_model&&event.device_model!=='K'?' · Modelo: '+event.device_model:' · Modelo no disponible'}</span>
                   </div>)}</div>}
               <small>{history[person.actor_id]?.since}</small>
             </>}
           <div className="a-member-impact">
               <div className="a-member-installation">
                 <strong>{person.installation_bound===1?'Dispositivo único vinculado':'Dispositivo aún sin vincular'}</strong>
                 <small>{person.installation_bound===1?
                   'Este nombre no puede iniciar sesión desde otro dispositivo. Los intentos se notificarán aquí.':
                   'El primer acceso a este nombre quedará vinculado a una sola instalación.'}</small>
                 {person.installation_bound===1&&<button type="button"
                   disabled={!!releaseBusy||!!removing} onClick={()=>void releaseInstallation(person)}>
                   {releaseBusy===person.actor_id?'Liberando…':'Liberar dispositivo'}
                 </button>}
               </div>

             <button type="button" onClick={()=>void inspectMemberData(person)}
               disabled={impactLoading===person.actor_id||!!removing}
               aria-label={'Consultar datos asociados a '+person.display_name}>
               {impactLoading===person.actor_id?'Consultando Cloudflare…':'Ver datos asociados'}
             </button>
             <small>Consulta de solo lectura. No elimina ni modifica información.</small>
             {impactErrors[person.actor_id]&&<p className="a-admin-error" role="alert">{impactErrors[person.actor_id]}</p>}
             {impact[person.actor_id]&&<MemberImpactSummary
               name={person.display_name} preview={impact[person.actor_id]!}/>}
           </div>
         </div>}
       </div>)}</div>}
   </section>
 </div>;
}
