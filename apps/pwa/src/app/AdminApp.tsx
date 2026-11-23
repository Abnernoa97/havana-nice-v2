import {useEffect,useState} from 'react';
import AdminChatAccess from '../features/admin/AdminChatAccess';

// The admin-only navigation is deliberately flat. Authentication/session,
// permissions and every destructive action stay in their original modules.
type Tab='home'|'chat'|'repertoire'|'calendar'|'family'|'access'|'memory'|'audio'|'notices';
type WorkTab=Exclude<Tab,'home'>;
const tabs:{id:WorkTab;name:string;icon:string;description:string}[]=[
 {id:'chat',name:'Chat',icon:'◉',description:'Conversación del equipo y moderación'},
 {id:'repertoire',name:'Repertorio',icon:'♫',description:'Canciones y repertorio por evento'},
 {id:'calendar',name:'Calendario',icon:'▦',description:'Fechas, horarios y músicos asignados'},
 {id:'family',name:'Familia',icon:'▣',description:'Fotografías, videos y BOOK'},
 {id:'audio',name:'Audio',icon:'♪',description:'Biblioteca de audio'},
 {id:'notices',name:'Notificaciones',icon:'✉',description:'Enviar avisos al equipo'},
 {id:'access',name:'Acceso a músicos',icon:'♙',description:'Integrantes y dispositivos autorizados'},
 {id:'memory',name:'Resumen de memoria',icon:'◫',description:'Archivos, almacenamiento y espacio disponible'},
];
export default function AdminApp(){
 const [tab,setTab]=useState<Tab>('home');
 useEffect(()=>{
  window.history.replaceState({...window.history.state,havanaAdminTab:'home'},'');
  const back=()=>{const state=window.history.state as {havanaAdminTab?:Tab}|null;
   setTab(state?.havanaAdminTab||'home');window.scrollTo({top:0,behavior:'instant'});};
  window.addEventListener('popstate',back);
  return()=>window.removeEventListener('popstate',back);
 },[]);
 const [installEvent,setInstallEvent]=useState<Event|null>(null);
 const [updatePending,setUpdatePending]=useState(false);
 const current=tabs.find(item=>item.id===tab);
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
 const navigate=(next:Tab)=>{
  if(next===tab)return;
  window.history.pushState({...window.history.state,havanaAdminTab:next},'');
  setTab(next);window.scrollTo({top:0,behavior:'instant'});
 };
 const goBack=()=>{if(tab!=='home')window.history.back();};
 const navButton=(item:(typeof tabs)[number])=><button key={item.id} type="button"
  aria-current={tab===item.id?'page':undefined}
  className={tab===item.id?'active':''} onClick={()=>navigate(item.id)}>
  <span aria-hidden="true">{item.icon}</span><span>{item.name}</span>
 </button>;
 return <div className="a-shell visual-shell hn-admin-editorial hn-admin-minimal">
  <header className="a-header visual-header hn-admin-minimal-header">
   <button type="button" className="hn-admin-brand-button" aria-label="Inicio del Administrador"
    onClick={()=>navigate('home')}>
    <strong>HAVANA NICE</strong><small>ADMINISTRADOR</small>
   </button>
   <div className="a-header-tools">
    {installEvent&&<button className="a-install" type="button" onClick={install}>Instalar</button>}
    <button type="button" className="hn-admin-home-shortcut" aria-label="Volver al menú"
     onClick={()=>navigate('home')}>⌂</button>
   </div>
  </header>
  <div className="a-layout visual-layout">
   <aside className="a-side visual-side">
    <nav aria-label="Secciones del Administrador">{tabs.map(navButton)}</nav>
   </aside>
   <main className="a-main visual-content" id="admin-content">
    {tab==='home'?<div className="hn-admin-plain-menu" aria-label="Funciones del Administrador">
     {tabs.map(item=><button type="button" key={item.id} onClick={()=>navigate(item.id)}
      className="hn-admin-plain-item">
      <span className="hn-admin-plain-icon" aria-hidden="true">{item.icon}</span>
      <span className="hn-admin-plain-title">{item.name}</span>
      <span aria-hidden="true" className="hn-admin-plain-arrow">›</span>
     </button>)}
    </div>:<div className="a-title hn-admin-simple-title">
      <button type="button" onClick={goBack} aria-label="Regresar">‹</button>
      <h1>{current?.name}</h1>
     </div>}
    {updatePending&&<div className="a-admin-update-pending" role="status">
     Hay una actualización preparada. Se aplicará cuando cierres sesión.
    </div>}
    {/* The authenticated admin controller stays mounted even when HOME is shown:
        tab changes must never discard a valid private session. */}
    <div hidden={tab==='home'} className="hn-admin-auth-workspace">
     <AdminChatAccess section={tab==='home'?'access':tab}/>
    </div>
   </main>
  </div>
  <nav className="a-bottom visual-bottom-nav" aria-label="Funciones del Administrador">
   {tabs.filter(item=>item.id!=='audio'&&item.id!=='memory').map(navButton)}
  </nav>
 </div>;
}
