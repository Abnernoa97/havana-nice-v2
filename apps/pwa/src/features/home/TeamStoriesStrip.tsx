import type {MemberProfile} from '@havana/shared';

export default function TeamStoriesStrip({displayName,actorId,profiles,preview,canEditProfile,onOpenProfile}:{
 displayName:string|undefined;actorId:string|undefined;profiles:readonly MemberProfile[];
 preview:boolean;canEditProfile:boolean;onOpenProfile:()=>void;
}){
 const me=displayName?.trim()||'Mi perfil';
 const visible=profiles.filter(p=>p.actorId!==actorId&&p.name.toLocaleLowerCase()!==me.toLocaleLowerCase());
 const mine=profiles.find(p=>p.actorId===actorId);
 return <div className="hn-moments-wrap">
  <div className="hn-moments-strip" aria-label="Perfiles del equipo">
   <div className="hn-moment-person hn-moment-self">
    <button type="button" className="hn-moment-circle" onClick={onOpenProfile}
     disabled={preview||!canEditProfile} aria-label="Abrir mi perfil">
     <span className="hn-moment-photo">
      {mine?.photoUrl?<img src={mine.photoUrl} alt=""/>:
       <span className="hn-moment-initial">{me.charAt(0).toUpperCase()}</span>}
     </span>
     <span className="hn-moment-add" aria-hidden="true">+</span>
    </button>
    <span className="hn-moment-name">{preview?'Mi perfil':me}</span>
   </div>
   {visible.map(person=><div className="hn-moment-person" key={person.actorId}>
    <div className="hn-moment-circle" aria-label={'Perfil de '+person.name}>
     <span className="hn-moment-photo">
      {person.photoUrl?<img src={person.photoUrl} alt=""/>:
       <span className="hn-moment-initial">{person.name.charAt(0).toUpperCase()}</span>}
     </span>
    </div>
    <span className="hn-moment-name">{person.name}</span>
   </div>)}
  </div>
 </div>;
}
