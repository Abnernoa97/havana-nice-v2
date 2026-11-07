import {useCallback,useEffect,useState} from 'react';
import {fetchBackendHealth,type BackendHealth} from '@havana/shared';
import AdminChatAccess from './AdminChatAccess';

type Tab='access'|'chat'|'repertoire'|'calendar'|'family'|'more';
const tabs:{id:Tab;name:string;icon:string;description:string}[]=[
 {id:'access',name:'Acceso a músicos',icon:'♙',description:'Crea y autoriza los nombres con los que entrará cada integrante'},
 {id:'chat',name:'Chat',icon:'◉',description:'Chat general en vivo de todos los músicos, con moderación administrativa'},
 {id:'repertoire',name:'Repertorio',icon:'♫',description:'Gestiona el repertorio general y las listas de cada evento'},
 {id:'calendar',name:'Calendario',icon:'▦',description:'Crea, edita y asigna fechas a los músicos'},
 {id:'family',name:'Familia HAVANA NICE',icon:'▣',description:'Carpetas de los integrantes y BOOK HAVANA NICE'},
 {id:'more',name:'Más',icon:'◇',description:'Aquí incorporaremos las siguientes funciones de la app'},
];
export default function AdminApp(){
 const [tab,setTab]=useState<Tab>('access');
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
 const navigation=tabs.map(item=><button key={item.id} type="button" onClick={()=>setTab(item.id)}
   aria-current={item.id===tab?'page':undefined} className={item.id===tab?'active':''}>
   <span aria-hidden="true">{item.icon}</span><span>{item.name}</span></button>);
 return <div className="a-shell">
   <header className="a-header">
     <div><strong>HAVANA NICE</strong><small>V2 / ADMINISTRADOR</small></div>
     <div className="a-header-tools">
       {installEvent&&<button className="a-install" type="button" onClick={install}>Instalar</button>}
       <span className="a-badge">ADMIN</span>
     </div>
   </header>
   <div className="a-layout">
     <aside className="a-side">
       <div className="a-eyebrow">ADMINISTRACIÓN</div>
       <h2 className="a-side-heading">Panel general</h2>
       <nav aria-label="Secciones del Administrador">{navigation}</nav>
       <p>Un solo Administrador. Cada módulo se incorporará cuando esté listo.</p>
     </aside>
     <main className="a-main">
       <div className="a-title">
         <span className="a-eyebrow">HAVANA NICE / ADMINISTRADOR</span>
         <h1>{current.name}</h1><p>{current.description}</p>
       </div>
       {tab==='access'&&<div className="a-health a-health-compact" role="status">
         <div className="a-health-main">
           <span className={health.phase==='online'?'a-health-dot online':'a-health-dot'} aria-hidden="true"/>
           <div><strong>{health.phase==='online'?'Servidor conectado':health.phase==='checking'?'Comprobando conexión…':'Conexión sin confirmar'}</strong>
             <p>Los nombres autorizados se guardan en el servidor V2.</p></div>
         </div>
       </div>}
       {updatePending&&<div className="a-admin-update-pending" role="status">
         Hay una actualización preparada. Se aplicará cuando cierres sesión, sin interrumpir tu trabajo.
       </div>}
       <AdminChatAccess section={tab}/>
       {tab!=='access'&&tab!=='chat'&&tab!=='calendar'&&tab!=='repertoire'&&tab!=='family'&&<section className="a-panel a-module-next">
         <h2>{current.name}</h2>
         <p>Este módulo se desarrollará conforme al Plan Maestro. Por ahora no hay funciones activas.</p>
         <button type="button" onClick={()=>setTab('access')}>Volver a Acceso a músicos</button>
       </section>}
       <footer>HAVANA NICE V2 · Administrador único</footer>
     </main>
   </div>
   <nav className="a-bottom" aria-label="Secciones del Administrador">{navigation}</nav>
 </div>;
}
