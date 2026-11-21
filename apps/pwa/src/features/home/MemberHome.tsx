import {memo} from 'react';
import TeamStoriesStrip from './TeamStoriesStrip';
import './home-stage.css';

// Independent HOME stage. Chat, Calendar, Repertoire and Family remain unmounted.
// Profile photographs, stories and the radio will be enabled only with their private API.
type Props={displayName:string|undefined;token?:string;preview:boolean};
function MemberHome({displayName,token,preview}:Props){
 return <section className="hn-home-stage" aria-label="Inicio del equipo">
   <TeamStoriesStrip token={token} displayName={displayName} preview={preview}/>
   <div className="hn-home-blank" aria-hidden="true"/>
 </section>;
}
export default memo(MemberHome);
