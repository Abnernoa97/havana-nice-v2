import type {MemberProfile} from '@havana/shared';
import {memo} from 'react';
import TeamStoriesStrip from './TeamStoriesStrip';
import './home-stage.css';

type Props={
 displayName:string|undefined;actorId:string|undefined;profiles:readonly MemberProfile[];
 preview:boolean;canEditProfile:boolean;onOpenProfile:()=>void;
};
function MemberHome({displayName,actorId,profiles,preview,canEditProfile,onOpenProfile}:Props){
 return <section className="hn-home-stage" aria-label="Inicio del equipo">
  <TeamStoriesStrip displayName={displayName} actorId={actorId} profiles={profiles}
   preview={preview} canEditProfile={canEditProfile} onOpenProfile={onOpenProfile}/>
  <div className="hn-home-blank" aria-hidden="true"/>
 </section>;
}
export default memo(MemberHome);
