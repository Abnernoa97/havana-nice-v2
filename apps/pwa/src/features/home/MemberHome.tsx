import type {MemberProfile} from '@havana/shared';
import {memo} from 'react';
import MemberStories from '../stories/MemberStories';
import './home-stage.css';

// Independent HOME: social states own their data and 24h lifecycle.
// The profile photograph and editor live exclusively in the header's Profile.
type Props={
 token:string|undefined;displayName:string|undefined;actorId:string|undefined;
 profiles:readonly MemberProfile[];preview:boolean;canEditProfile:boolean;
 onPhotoError:(memberId:string)=>void;refreshVersion:number;
};
function MemberHome({token,displayName,actorId,profiles,preview,canEditProfile,
 onPhotoError,refreshVersion}:Props){
 return <section className="hn-home-stage" aria-label="Inicio del equipo">
  <MemberStories token={token} displayName={displayName} actorId={actorId} profiles={profiles}
   preview={preview} canEditProfile={canEditProfile} onPhotoError={onPhotoError}
   refreshVersion={refreshVersion}/>
  <div className="hn-home-blank" aria-hidden="true"/>
 </section>;
}
export default memo(MemberHome);
