import {memo} from 'react';
import {MEMBER_MODULES,type MemberScreen} from '@havana/shared';

// HOME content lives in its own on-demand module, like Calendar and Family.
// This view never creates a session, socket, storage, or backend request.
type Props={
  displayName:string|undefined;
  preview:boolean;
  onNavigate:(screen:MemberScreen)=>void;
};
function MemberHome({displayName,preview,onNavigate:navigate}:Props){
  const tabs=MEMBER_MODULES;
  return <>

          <div className="visual-section-header">
            <span className="visual-overline">HAVANA NICE / EQUIPO</span>
            <h1>Inicio</h1>
            <p className="visual-intro">Todo lo que necesitas, en un solo espacio.</p>
          </div>
          <div className="visual-welcome">
            <div><span className="visual-overline">TU ESPACIO PRIVADO</span>
              <h2>{preview?'Espacio de trabajo':`Hola, ${displayName||'integrante'}.`}</h2>
              <p>Eventos, repertorio y archivos del equipo. Todo aquí.</p></div>
            <span className="visual-mark" aria-hidden="true">HN</span>
          </div>
          <div className="visual-grid">
            {tabs.map(item=><button key={item.id} className="visual-tile" type="button"
              disabled={preview&&item.id==='chat'} onClick={()=>navigate(item.id)}>
              <span className="visual-tile-top">
                <span className="visual-tile-icon" aria-hidden="true">{item.glyph}</span>
                <span className="visual-tile-status">{item.ready?'DISPONIBLE':'EN PREPARACIÓN'}</span>
              </span>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              <span className="visual-tile-open" aria-hidden="true">Abrir ›</span>
            </button>)}
          </div>

  </>;
}
export default memo(MemberHome);
