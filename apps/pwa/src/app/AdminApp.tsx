import {useCallback,useEffect,useState} from 'react';
import {fetchBackendHealth,type BackendHealth} from '@havana/shared';
import AdminChatAccess from '../features/admin/AdminChatAccess';

// The administrator and musician share the SAME editorial shell. Administrator
// permissions remain server-owned in AdminChatAccess and the existing APIs.
type Tab='home'|'chat'|'calendar'|'repertoire'|'family'|'access'|'more';
const tabs:{id:Tab;name:string;icon:string;description:string}[]=[
 {id:'home',name:'Inicio',icon:'⌂',description:'Tu espacio de trabajo y el equipo HAVANA NICE'},
 {id:'chat',name:'Chat',icon:'◉',description:'La conversación del equipo, con herramientas de moderación'},
 {id:'calendar',name:'Calendario',icon:'▦',description:'Las mismas fechas del equipo, con opciones para agregar, editar y asignar'},
 {id:'repertoire',name:'Repertorio',icon:'♫',description:'Las mismas canciones y listas, con opciones para administrarlas'},
 {id:'family',name:'Familia HAVANA NICE',icon:'▣',description:'Los álbumes del equipo, con gestión privada de fotografías y videos'},
 {id:'access',name:'Equipo',icon:'♙',description:'Nombres autorizados, dispositivos y seguridad del equipo'},
 {id:'more',name:'Más',icon:'◇',description:'Otras herramientas de Administración'},
];
const bottomTabs:Tab[]=['home','chat','calendar','repertoire','family','access'];
export default function AdminApp(){
 const [tab,setTab]=useState<Tab>('home');
 const [health,setHealth]=useState<{phase:'checking'|'online'|'offline';data:BackendHealth|null}>({phase:'checking',data:null});
 const [installEvent,setInstallEvent]=useState<Event|null>(null);
 const [updatePending,setUpdatePending]=useState(false);
 const current=tabs.find(item=>item.id===tab)!;
 const refresh=useCallback(async()=>{
  try{const data=await fetchBackendHealth();setHealth({phase:data.ok&&data.database==='ok'?'online':'offline',data});}
  catch{setHealth(previous=>({...previous,phase:'offline'}));}
 },[]);
 useEffect(()=>{
  void refresh();const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},45_000);
  const onReturn=()=>{if(!document.hidden)void refresh();};
  document.addEventListener('visibilitychange',onReturn);window.addEventListener('online',onReturn);
  return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onReturn);window.removeEventListener('online',onReturn);};
 },[refresh]);
 useEffect(()=>{
  const handler=()=>setUpdatePending(true);
  if(document.documentElement.dataset.adminUpdatePending==='true')setUpdatePending(true);
  window.addEventListener('havana-admin-update-pending',handler);
  return()=>window.removeEventListener('havana-admin-update-pending',handler);
 },[]);
 useEffect(()=>{
  const capture=(event:Event)=>{event.preventDefault();setInstallEvent(event);};
  window.addEventListener('beforeinstallprompt',capture);
  return()=>window.removeEventListener('beforeinstallprompt',capture);
 },[]);
 function install(){
  const e=installEvent as (Event&{prompt:()=>Promise<void>;userChoice:Promise<unknown>})|null;
  if(!e)return;
  void e.prompt().then(()=>e.userChoice).finally(()=>setInstallEvent(null));
 }
 function navigationButton(item:(typeof tabs)[number],mobile=false){
  return <button key={item.id} type="button" onClick={()=>setTab(item.id)}
   aria-current={item.id===tab?'page':undefined}
   aria-label={mobile?(item.id==='access'?'Equipo':item.name):undefined}
   className={item.id===tab?'active':''}>
    <span aria-hidden="true">{item.icon}</span><span>{item.name}</span>
   </button>;
 }
 return <div className="a-shell visual-shell hn-admin-editorial">
  <header className="a-header visual-header">
   <div className="hn-admin-brand">
    <strong className="visual-brand">HAVANA NICE</strong>
    <small className="visual-subtitle">ESPACIO DEL EQUIPO · ADMINISTRACIÓN</small>
   </div>
   <div className="a-header-tools">
    {installEvent&&<button className="a-install" type="button" onClick={install}>Instalar</button>}
    <button type="button" className="hn-admin-profile" onClick={()=>setTab('access')}
     aria-current={tab==='access'?'page':undefined}
     aria-label="Abrir herramientas del equipo">
      <span className="hn-admin-profile-mark">H</span>
      <span className="hn-admin-profile-label">Equipo <small>ADMIN</small></span>
    </button>
   </div>
  </header>
  <div className="a-layout visual-layout">
   <aside className="a-side visual-side">
    <div className="visual-side-title">ESPACIO DEL EQUIPO</div>
    <nav aria-label="Secciones del Administrador">{tabs.map(item=>navigationButton(item))}</nav>
    <p className="visual-side-note">Vista del equipo con herramientas privadas de Administración.</p>
   </aside>
   <main className="a-main visual-content" id="admin-content">
    {tab==='home'?<div className="hn-admin-home">
      <div className="visual-welcome">
       <div><span className="visual-overline">HAVANA NICE / ADMINISTRADOR</span>
        <h2>Tu espacio de trabajo</h2>
        <p>El mismo equipo y la misma información. Aquí puedes administrar todo desde un solo lugar.</p>
       </div><span className="visual-mark" aria-hidden="true">HN</span>
      </div>
      <div className="hn-admin-shortcuts" aria-label="Accesos de Administración">
       {tabs.filter(item=>['chat','calendar','repertoire','family'].includes(item.id)).map(item=>
        <button type="button" key={item.id} onClick={()=>setTab(item.id)}>
         <span className="hn-admin-shortcut-symbol" aria-hidden="true">{item.icon}</span>
         <strong>{item.name}</strong><span aria-hidden="true">›</span>
        </button>)}
      </div>
     </div>:
     <div className="a-title visual-section-header">
      <span className="visual-overline">HAVANA NICE / ADMINISTRADOR</span>
      <h1>{current.name}</h1><p className="visual-intro">{current.description}</p>
     </div>}
    {(tab==='home'||tab==='access')&&<div className="a-health a-health-compact" role="status">
     <div className="a-health-main">
      <span className={health.phase==='online'?'a-health-dot online':'a-health-dot'} aria-hidden="true"/>
      <div><strong>{health.phase==='online'?'Servidor conectado':health.phase==='checking'?'Comprobando conexión…':'Conexión sin confirmar'}</strong>
       <p>Los nombres autorizados y sus datos se guardan en HAVANA NICE V2.</p>
      </div>
     </div>
    </div>}
    {updatePending&&<div className="a-admin-update-pending" role="status">
     Hay una actualización preparada. Se aplicará cuando cierres sesión, sin interrumpir tu trabajo.
    </div>}
    <AdminChatAccess section={tab==='home'?'access':tab}/>
    {tab==='more'&&<section className="a-panel a-module-next">
     <h2>Más herramientas</h2>
     <p>Las funciones existentes están disponibles desde Equipo, Chat, Calendario, Repertorio y Familia.</p>
     <button type="button" onClick={()=>setTab('access')}>Abrir Equipo</button>
    </section>}
   </main>
  </div>
  <nav className="a-bottom visual-bottom-nav" aria-label="Secciones del Administrador">
   {bottomTabs.map(id=>navigationButton(tabs.find(item=>item.id===id)!,true))}
  </nav>
 </div>;
}
