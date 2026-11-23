import type {MemberProfile,MemberStory} from '@havana/shared';
import {useEffect,useSyncExternalStore} from 'react';
import PrivateProfileAvatar from '../profile/PrivateProfileAvatar';
import {getWarmStoryPhoto,subscribeStoryPhotos,warmStoryPhoto} from '../stories/story-photo-pool';

// A status is never visually mistaken for a new permanent profile picture.
function StoryCover({story,name,onError}:{story:MemberStory;name:string;onError:(id:string)=>void}){
 const cover=useSyncExternalStore(subscribeStoryPhotos,
  ()=>getWarmStoryPhoto(story),()=>'');
 useEffect(()=>{
  let active=true;
  void warmStoryPhoto(story).then(url=>{if(active&&!url)onError(story.id);});
  return()=>{active=false;};
 },[story.id,story.photoUrl]);
 return cover?<img src={cover} alt={'Portada del estado de '+name} decoding="sync"/>:
  <span className="hn-moment-story-pending" aria-hidden="true">ESTADO</span>;
}

// The circle belongs to the newest 24h story. The header photo belongs to Profile.
export default function TeamStoriesStrip({displayName,actorId,profiles,preview,canEditProfile,
 onPhotoError,onStoryPhotoError,stories,ready,onOpenStory,onAddStory}:{
 displayName:string|undefined;actorId:string|undefined;profiles:readonly MemberProfile[];
 preview:boolean;canEditProfile:boolean;onPhotoError:(memberId:string)=>void;
 onStoryPhotoError:(storyId:string)=>void;stories:readonly MemberStory[];ready:boolean;
 onOpenStory:(actorId:string)=>void;onAddStory:()=>void;
}){
 const me=displayName?.trim()||'Mi perfil';
 const mine=profiles.find(p=>p.actorId===actorId);
 // Stories are authoritative even when a teammate's Profile endpoint is
 // delayed or returns an incomplete roster. Never hide a valid Android/PWA
 // upload just because the separate profile response missed its author.
 const members=new Map(profiles.map(person=>[person.actorId,person]));
 for(const story of stories){
  if(story.expiresAt>Date.now()&&!members.has(story.actorId)){
   members.set(story.actorId,{
    actorId:story.actorId,name:story.name,photoUrl:null
   });
  }
 }
 const visible=[...members.values()].filter(person=>
  person.actorId!==actorId&&person.name.toLowerCase()!==me.toLowerCase());
 const newest=(id:string|undefined)=>id?stories.filter(s=>s.actorId===id&&s.expiresAt>Date.now())
  .reduce<MemberStory|null>((recent,story)=>!recent||story.createdAt>recent.createdAt||
   (story.createdAt===recent.createdAt&&story.id>recent.id)?story:recent,null):null;
 const circle=(person:{actorId:string;name:string;photoUrl:string|null},own=false)=>{
  const story=newest(person.actorId);
  const count=stories.filter(s=>s.actorId===person.actorId&&s.expiresAt>Date.now()).length;
  return <div className={'hn-moment-person'+(own?' hn-moment-self':'')} key={person.actorId}>
   <div className="hn-moment-avatar-slot">
    <button type="button" className={'hn-moment-circle'+(story?' hn-moment-has-story':'')}
     onClick={()=>onOpenStory(person.actorId)} disabled={!story}
     aria-label={story?'Ver '+count+' estados de '+person.name:'Sin estados de '+person.name}>
     <span className="hn-moment-photo">
      {!ready?<span className="hn-moment-story-pending" aria-hidden="true">···</span>:
       story?<StoryCover story={story} name={person.name} onError={onStoryPhotoError}/>:
       <PrivateProfileAvatar photoUrl={person.photoUrl} name={person.name}
        fallbackClassName="hn-moment-initial"
        onImageFailure={()=>onPhotoError(person.actorId)}/>}

     </span>
    </button>
    {count>0&&<span className="hn-moment-count" aria-label={count+' estados activos'}>{count}</span>}
    {own&&<button type="button" className="hn-moment-add" onClick={onAddStory}
     disabled={preview||!canEditProfile} aria-label="Publicar hasta 5 fotos en estados de 24 horas">+</button>}
   </div>
   <span className="hn-moment-name">{own&&preview?'Mi estado':person.name}</span>
   {count>0&&<span className="hn-moment-state-label">ESTADO · {count}</span>}
  </div>;
 };
 return <div className="hn-moments-wrap">
  <div className="hn-moments-strip" aria-label="Estados del equipo">
   {circle({actorId:actorId||'preview',name:me,photoUrl:mine?.photoUrl||null},true)}
   {visible.map(person=>circle(person))}
  </div>
 </div>;
}
