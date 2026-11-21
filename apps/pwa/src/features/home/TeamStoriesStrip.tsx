import {useCallback,useEffect,useState} from 'react';
import {getMusicianDirectory,type MusicianDirectoryEntry} from '@havana/shared';

// Only the existing authorized roster. No fabricated avatars, extra login,
// WebSocket, R2 mutations or state publication until the social API is live.
export default function TeamStoriesStrip({token,displayName,preview}:{
 token:string|undefined;displayName:string|undefined;preview:boolean
}){
 const [members,setMembers]=useState<MusicianDirectoryEntry[]>([]);
 const [error,setError]=useState('');
 const refresh=useCallback(async()=>{
  if(!token)return;
  try{setMembers(await getMusicianDirectory(token));setError('');}
  catch{setError('No se pudieron cargar los integrantes.');}
 },[token]);
 useEffect(()=>{
  if(!token){setMembers([]);return;}
  let mounted=true;
  void getMusicianDirectory(token).then(value=>{if(mounted){setMembers(value);setError('');}})
   .catch(()=>{if(mounted)setError('No se pudieron cargar los integrantes.');});
  const resume=()=>{if(!document.hidden&&navigator.onLine)void refresh();};
  window.addEventListener('online',resume);
  document.addEventListener('visibilitychange',resume);
  return()=>{mounted=false;window.removeEventListener('online',resume);
   document.removeEventListener('visibilitychange',resume);};
 },[token,refresh]);
 const me=displayName?.trim()||'Mi perfil';
 const visible=members.filter(person=>person.name.toLocaleLowerCase()!==me.toLocaleLowerCase());
 return <div className="hn-moments-wrap">
   <div className="hn-moments-strip" aria-label="Perfiles del equipo">
     <div className="hn-moment-person hn-moment-self">
       <div className="hn-moment-circle" aria-label={'Perfil de '+me}>
         <span className="hn-moment-initial">{me.charAt(0).toUpperCase()}</span>
         <span className="hn-moment-add" aria-hidden="true">+</span>
       </div>
       <span className="hn-moment-name">{preview?'Mi perfil':me}</span>
     </div>
     {visible.map(person=><div className="hn-moment-person" key={person.actorId}>
       <div className="hn-moment-circle" aria-label={'Perfil de '+person.name}>
         <span className="hn-moment-initial">{person.name.charAt(0).toUpperCase()}</span>
       </div>
       <span className="hn-moment-name">{person.name}</span>
     </div>)}
   </div>
   {error&&<p className="hn-moments-info" role="status">{error}</p>}
 </div>;
}
