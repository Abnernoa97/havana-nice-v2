import {useState} from 'react';
import {MEMBER_MODULES,type MemberScreen} from '@havana/shared';
import CalendarAccordion from '../features/calendar/CalendarAccordion';
import MemberRepertoire from '../features/repertoire/MemberRepertoire';
import MemberFamily from '../features/family/MemberFamily';

type Props={
  displayName?:string;
  active?:Exclude<MemberScreen,'chat'>;
  onNavigate?:(screen:MemberScreen)=>void;
  preview?:boolean;
  token?:string;
};
const notes:Record<Exclude<MemberScreen,'chat'|'home'>,string>={
  calendar:'El Calendario mostrará los eventos reales y sus horarios al conectar el Administrador.',
  repertoire:'Las canciones y listas estarán disponibles cuando se conecten los datos reales.',
  musicians:'La información del equipo estará disponible cuando se implemente este módulo.',
  family:'Las fotografías y los videos privados se muestran al entrar con una sesión autorizada. BOOK HAVANA NICE muestra las páginas que publique Administración.',
  notices:'Los avisos se mostrarán cuando exista almacenamiento y permisos para cada músico.',
  settings:'Las preferencias se habilitarán cuando podamos guardarlas de forma segura.',
};
// Reuses the existing visual shell for the member HOME after successful login.
// /visual.html remains presentation-only; it cannot open Chat or issue a session.
export default function VisualApp({displayName,active,onNavigate,preview=false,token}:Props){
  const [previewScreen,setPreviewScreen]=useState<MemberScreen>('home');
  const screen=active??previewScreen;
  const navigate=(target:MemberScreen)=>{
    if(target==='chat'&&!onNavigate)return; // Public preview never opens private Chat.
    if(onNavigate)onNavigate(target);
    else setPreviewScreen(target);
  };
  const selected=MEMBER_MODULES.find(item=>item.id===screen);
  const tabs=MEMBER_MODULES;
  return <div className="visual-shell">
    <header className="visual-header">
      <div><div className="visual-brand">HAVANA NICE</div><div className="visual-subtitle">ESPACIO DEL EQUIPO · V2</div></div>
      <span className="visual-preview">{preview?'Vista preliminar':displayName||'Mi espacio'}</span>
    </header>
    <div className="visual-layout">
      <aside className="visual-side" aria-label="Módulos de HAVANA NICE">
        <p className="visual-side-title">MÓDULOS</p>
        <button className={screen==='home'?'visual-nav active':'visual-nav'}
          aria-current={screen==='home'?'page':undefined} onClick={()=>navigate('home')} type="button">
          <span aria-hidden="true">⌂</span> Inicio
        </button>
        {tabs.map(item=><button key={item.id} type="button"
          className={screen===item.id?'visual-nav active':'visual-nav'}
          aria-current={screen===item.id?'page':undefined}
          onClick={()=>navigate(item.id)}>
          <span aria-hidden="true">{item.glyph}</span> {item.label}
        </button>)}
        <div className="visual-side-note">Una sola identidad autorizada para HOME y Chat.</div>
      </aside>
      <main className="visual-content" id="visual-content">
        {screen==='home'?<>
          <div className="visual-section-header">
            <span className="visual-overline">HAVANA NICE / HOME</span>
            <h1>Inicio</h1>
            <p className="visual-intro">Accede a las herramientas del equipo.</p>
          </div>
          <div className="visual-welcome">
            <div><span className="visual-overline">ACCESO AUTORIZADO</span>
              <h2>{preview?'Espacio de trabajo':`Bienvenido, ${displayName||'integrante'}.`}</h2>
              <p>Tu equipo y tus próximos eventos, en un solo lugar.</p></div>
            <span className="visual-mark" aria-hidden="true">HN</span>
          </div>
          <div className="visual-grid">
            {tabs.map(item=><button key={item.id} className="visual-tile" type="button"
              disabled={preview&&item.id==='chat'} onClick={()=>navigate(item.id)}>
              <span className="visual-overline">{item.glyph} · {item.ready?'DISPONIBLE':'EN PREPARACIÓN'}</span>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>)}
          </div>
        </>:<>
          <div className="visual-section-header">
            <button className="visual-back" type="button" onClick={()=>navigate('home')}>‹ Inicio</button>
            <span className="visual-overline">HAVANA NICE / {selected?.label.toUpperCase()}</span>
            <h1>{selected?.label}</h1>
            <p className="visual-intro">{selected?.description}</p>
          </div>
          {screen==='calendar'&&token?<CalendarAccordion token={token}/>:
           screen==='repertoire'&&token?<MemberRepertoire token={token}/>:
           screen==='family'&&token?<MemberFamily token={token}/>:
           <div className="visual-empty">
            <span className="visual-empty-icon" aria-hidden="true">◇</span>
            <h3>Módulo en preparación</h3>
            <p>{screen!=='chat'&&screen!=='calendar'?notes[screen]:'Vista privada: entra desde tu sesión autorizada.'}</p>
           </div>}
        </>}
      </main>
    </div>
    <nav className="visual-bottom-nav" aria-label="Navegación principal">
      {(['home','chat','calendar','repertoire','family'] as MemberScreen[]).map(item=>{
        const module=MEMBER_MODULES.find(module=>module.id===item);
        return <button key={item} type="button" disabled={preview&&item==='chat'}
          className={screen===item?'active':''} aria-current={screen===item?'page':undefined}
          onClick={()=>navigate(item)}>
          <span aria-hidden="true">{module?.glyph||'⌂'}</span><small>{module?.label||'Inicio'}</small>
        </button>;
      })}
    </nav>
  </div>;
}
