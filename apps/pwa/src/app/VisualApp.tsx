import {lazy,Suspense,memo,useState} from 'react';
import {usePwaMemberProfiles,PwaProfileLive} from '../features/profile/usePwaMemberProfiles';
import MemberProfilePanel from '../features/profile/MemberProfilePanel';
import PrivateProfileAvatar from '../features/profile/PrivateProfileAvatar';
import '../features/profile/profile.css';
import {MEMBER_MODULES,type MemberScreen} from '@havana/shared';
// Each module is a separate on-demand production chunk. The HOME shell and
// existing authorized session stay mounted; no routes, APIs or data flow change.
const CalendarAccordion=lazy(()=>import('../features/calendar/CalendarAccordion'));
const MemberRepertoire=lazy(()=>import('../features/repertoire/MemberRepertoire'));
const MemberMusicians=lazy(()=>import('../features/musicians/MemberMusicians'));
const MemberFamily=lazy(()=>import('../features/family/MemberFamily'));
const MemberHome=lazy(()=>import('../features/home/MemberHome'))

type Props={
  displayName?:string;
  active?:Exclude<MemberScreen,'chat'>;
  onNavigate?:(screen:MemberScreen)=>void;
  preview?:boolean;
  token?:string;
  actorId?:string;
};
const notes:Record<Exclude<MemberScreen,'chat'|'home'>,string>={
  calendar:'El Calendario mostrará los eventos reales y sus horarios al conectar el Administrador.',
  repertoire:'Las canciones y listas estarán disponibles cuando se conecten los datos reales.',
  musicians:'La lista de integrantes requiere la sesión autorizada del equipo.',
  family:'Las fotografías y los videos privados se muestran al entrar con una sesión autorizada. BOOK HAVANA NICE muestra las páginas que publique Administración.',
  notices:'Las notificaciones estarán disponibles cuando activemos su sistema privado.',
};
// Reuses the existing visual shell for the member HOME after successful login.
// /visual.html remains presentation-only; it cannot open Chat or issue a session.
function VisualApp({displayName,active,onNavigate,preview=false,token,actorId}:Props){
  const [profileOpen,setProfileOpen]=useState(false);
  const profile=usePwaMemberProfiles(token,actorId);
  const own=profile.own;
  const [previewScreen,setPreviewScreen]=useState<MemberScreen>('home');
  const screen=active??previewScreen;
  const navigate=(target:MemberScreen)=>{
    if(target==='chat'&&!onNavigate)return; // Public preview never opens private Chat.
    if(onNavigate)onNavigate(target);
    else setPreviewScreen(target);
  };
  const selected=MEMBER_MODULES.find(item=>item.id===screen);
  const tabs=MEMBER_MODULES;
  return <div className={screen==='home'?'visual-shell hn-home-route':'visual-shell'}>
    <header className="visual-header">
      <div><div className="visual-brand">HAVANA NICE</div><div className="visual-subtitle">ESPACIO DEL EQUIPO</div></div>
      <button type="button" className="visual-account" disabled={preview||profile.phase==='legacy'||profile.phase==='offline'||profile.phase==='checking'} onClick={()=>setProfileOpen(true)}
        aria-label={'Abrir perfil de '+(displayName||'integrante')}>
        <span className="visual-account-avatar"><PrivateProfileAvatar photoUrl={own?.photoUrl} name={preview?'H':displayName||'H'} onImageFailure={()=>profile.retryPhoto(own?.actorId||'')}/></span>
        <span className="visual-account-label">{preview?'Vista previa':displayName||'Mi perfil'}</span>
      </button>
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
        {screen==='home'?<Suspense fallback={<div className="visual-empty" role="status">Abriendo Inicio…</div>}>
          <MemberHome displayName={displayName} actorId={actorId} profiles={profile.profiles} preview={preview} canEditProfile={profile.phase==='ready'||profile.phase==='missing'} onPhotoError={profile.retryPhoto} onOpenProfile={()=>setProfileOpen(true)}/>
        </Suspense>:<>
          <div className="visual-section-header">
            <button className="visual-back" type="button" onClick={()=>navigate('home')}>‹ Inicio</button>
            <span className="visual-overline">HAVANA NICE / {selected?.label.toUpperCase()}</span>
            <h1>{selected?.label}</h1>
            <p className="visual-intro">{selected?.description}</p>
          </div>
          <Suspense fallback={<div className="visual-empty" role="status" aria-live="polite">Abriendo módulo…</div>}>
           {screen==='calendar'&&token?<CalendarAccordion token={token}/>:
            screen==='repertoire'&&token?<MemberRepertoire token={token}/>:
            screen==='musicians'&&token?<MemberMusicians token={token}/>:
            screen==='family'&&token?<MemberFamily token={token}/>:
            <div className="visual-empty">
             <span className="visual-empty-icon" aria-hidden="true">◇</span>
             <h3>Módulo en preparación</h3>
             <p>{screen!=='chat'&&screen!=='calendar'?notes[screen]:'Vista privada: entra desde tu sesión autorizada.'}</p>
            </div>}
          </Suspense>
        </>}
      </main>
    </div>
    <nav className="visual-bottom-nav" aria-label="Navegación principal">
      {(['home','chat','calendar','repertoire','family','notices'] as MemberScreen[]).map(item=>{
        const module=MEMBER_MODULES.find(module=>module.id===item);
        return <button key={item} type="button" disabled={preview&&item==='chat'}
          className={screen===item?'active':''} aria-current={screen===item?'page':undefined}
          onClick={()=>navigate(item)}>
          <span aria-hidden="true">{module?.glyph||'⌂'}</span><small>{item==='family'?'Familia':module?.label||'Inicio'}</small>
        </button>;
      })}
    </nav>
    {!preview&&token&&(screen==='home'||profileOpen||profile.phase==='missing')&&<PwaProfileLive token={token} onChange={()=>{void profile.refresh();}}/>}
    {!preview&&token&&profile.phase==='checking'&&<div className="hn-profile-overlay" role="status">
      <div className="hn-profile-card">Comprobando tu perfil…</div>
    </div>}
    {!preview&&token&&(profile.phase==='missing'||profileOpen)&&profile.phase!=='checking'&&
     <MemberProfilePanel name={displayName||'integrante'} photo={own}
       required={profile.phase==='missing'} saving={profile.saving} error={profile.error}
       onUpload={profile.upload} onImageFailure={()=>profile.retryPhoto(own?.actorId||'')} onClose={()=>setProfileOpen(false)}/>}
  </div>;
}
// Ignore background Chat deliveries when no HOME prop changed.
export default memo(VisualApp);
