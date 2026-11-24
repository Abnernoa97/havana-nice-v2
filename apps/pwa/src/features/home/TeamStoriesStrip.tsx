import type {MemberProfile,MemberStory} from '@havana/shared';
import {useEffect,useRef,useState} from 'react';
import PrivateProfileAvatar from '../profile/PrivateProfileAvatar';
import {getWarmStoryPhoto,retainWarmStoryPhoto,invalidateWarmStoryPhoto} from '../stories/story-photo-pool';

// A status is never visually mistaken for a new permanent profile picture.
function StoryCover({story,name,profilePhoto,onError,onProfileError,token}:{
 story:MemberStory;name:string;profilePhoto:string|null;onError:(id:string)=>void;
 onProfileError:()=>void;token?:string|undefined;
}){
 const chosen=useRef<{id:string;grant:string;src:string}|null>(null);
 const [failedUrl,setFailedUrl]=useState('');
 // Match Android 0.0.30: the signed photo is a directly rendered image.
 // Cached JPEGs win if already decoded. A later background prefetch never
 // replaces a visible image or causes a flicker.
 if(!chosen.current||chosen.current.id!==story.id||chosen.current.grant!==story.photoUrl)
  chosen.current={id:story.id,grant:story.photoUrl,src:getWarmStoryPhoto(story)||story.photoUrl};
 const src=chosen.current.src;
 useEffect(()=>retainWarmStoryPhoto(src),[src]);
 return failedUrl===src?
  <PrivateProfileAvatar photoUrl={profilePhoto} name={name} token={token} actorId={story.actorId}
   fallbackClassName="hn-moment-initial" onImageFailure={onProfileError}/>:
  <img src={src} alt={'Portada del estado de '+name} loading="eager" decoding="async"
   onError={()=>{
    if(src.startsWith('blob:')){
     invalidateWarmStoryPhoto(story.id,src);
     if(chosen.current?.src===src)chosen.current.src=story.photoUrl;
     setFailedUrl(src);return;
    }
    setFailedUrl(src);onError(story.id);
   }}/>;
}

// The circle belongs to the newest 24h story. The header photo belongs to Profile.
export default function TeamStoriesStrip({displayName,actorId,profiles,preview,canEditProfile,token,
 onPhotoError,onStoryPhotoError,stories,ready,seenIds,onOpenStory,onAddStory}:{
 displayName:string|undefined;actorId:string|undefined;profiles:readonly MemberProfile[];
 preview:boolean;canEditProfile:boolean;token?:string|undefined;onPhotoError:(memberId:string)=>void;
 onStoryPhotoError:(storyId:string)=>void;stories:readonly MemberStory[];ready:boolean;
 seenIds:ReadonlySet<string>;
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
  const count=person.actorId===actorId?0:stories.filter(s=>
   s.actorId===person.actorId&&s.expiresAt>Date.now()&&!seenIds.has(s.id)).length;
  return <div className={'hn-moment-person'+(own?' hn-moment-self':'')} key={person.actorId}>
   <div className="hn-moment-avatar-slot">
    <button type="button" className={'hn-moment-circle'+(story?' hn-moment-has-story':'')}
     onClick={()=>onOpenStory(person.actorId)} disabled={!story}
     aria-label={story?'Ver '+count+' estados de '+person.name:'Sin estados de '+person.name}>
     <span className="hn-moment-photo">
      {ready&&story?<StoryCover story={story} name={person.name} profilePhoto={person.photoUrl}
       onError={onStoryPhotoError} token={token} onProfileError={()=>onPhotoError(person.actorId)}/>:
       <PrivateProfileAvatar photoUrl={person.photoUrl} name={person.name} token={token} actorId={person.actorId}
        fallbackClassName="hn-moment-initial"
        onImageFailure={()=>onPhotoError(person.actorId)}/>}

     </span>
    </button>
    {count>0&&<span className="hn-moment-count" aria-label={count+' estados sin ver'}>{count}</span>}
    {own&&<button type="button" className="hn-moment-add" onClick={onAddStory}
     disabled={preview||!canEditProfile} aria-label="Publicar hasta 5 fotos en estados de 24 horas">+</button>}
   </div>
   <span className="hn-moment-name">{own&&preview?'Mi estado':person.name}</span>
   {count>0&&<span className="hn-moment-state-label">NUEVOS · {count}</span>}
  </div>;
 };
 return <div className="hn-moments-wrap">
  <div className="hn-moments-strip" aria-label="Estados del equipo">
   {circle({actorId:actorId||'preview',name:me,photoUrl:mine?.photoUrl||null},true)}
   {visible.map(person=>circle(person))}
  </div>
 </div>;
}
