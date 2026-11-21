import type {MemberProfile,MemberStory} from '@havana/shared';
import PrivateProfileAvatar from '../profile/PrivateProfileAvatar';

export default function TeamStoriesStrip({displayName,actorId,profiles,preview,canEditProfile,
 onPhotoError,stories,onOpenStory,onAddStory}:{
 displayName:string|undefined;actorId:string|undefined;profiles:readonly MemberProfile[];
 preview:boolean;canEditProfile:boolean;onPhotoError:(memberId:string)=>void;
 stories:readonly MemberStory[];onOpenStory:(actorId:string)=>void;onAddStory:()=>void;
}){
 const me=displayName?.trim()||'Mi perfil';
 const mine=profiles.find(p=>p.actorId===actorId);
 const visible=profiles.filter(person=>person.actorId!==actorId&&person.name.toLowerCase()!==me.toLowerCase());
 const hasStory=(id:string|undefined)=>!!id&&stories.some(story=>story.actorId===id);
 return <div className="hn-moments-wrap">
  <div className="hn-moments-strip" aria-label="Estados del equipo">
   <div className="hn-moment-person hn-moment-self">
    <div className="hn-moment-avatar-slot">
     <button type="button" className={'hn-moment-circle'+(hasStory(actorId)?' hn-moment-has-story':'')}
      onClick={()=>actorId&&onOpenStory(actorId)} disabled={!hasStory(actorId)}
      aria-label={hasStory(actorId)?'Ver mis estados':'Todavía no tengo estados'}>
      <span className="hn-moment-photo">
       <PrivateProfileAvatar photoUrl={mine?.photoUrl} name={me} fallbackClassName="hn-moment-initial"
        onImageFailure={()=>onPhotoError(mine?.actorId||'')}/>
      </span>
     </button>
     <button type="button" className="hn-moment-add" onClick={onAddStory}
      disabled={preview||!canEditProfile} aria-label="Publicar estado de 24 horas">+</button>
    </div>
    <span className="hn-moment-name">{preview?'Mi estado':me}</span>
   </div>
   {visible.map(person=><div className="hn-moment-person" key={person.actorId}>
    <div className="hn-moment-avatar-slot">
     <button type="button" className={'hn-moment-circle'+(hasStory(person.actorId)?' hn-moment-has-story':'')}
      onClick={()=>onOpenStory(person.actorId)} disabled={!hasStory(person.actorId)}
      aria-label={hasStory(person.actorId)?'Ver estados de '+person.name:'Sin estados de '+person.name}>
      <span className="hn-moment-photo">
       <PrivateProfileAvatar photoUrl={person.photoUrl} name={person.name} fallbackClassName="hn-moment-initial"
        onImageFailure={()=>onPhotoError(person.actorId)}/>
      </span>
     </button>
    </div>
    <span className="hn-moment-name">{person.name}</span>
   </div>)}
  </div>
 </div>;
}
