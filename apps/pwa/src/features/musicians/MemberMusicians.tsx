import {useCallback,useEffect,useRef,useState} from 'react';
import {getMusicianDirectory,type MusicianDirectoryEntry} from '@havana/shared';
import {useFamilyLive} from '../../services/use-family-live';
export default function MemberMusicians({token}:{token:string}){
 const [members,setMembers]=useState<MusicianDirectoryEntry[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const requestId=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++requestId.current;
  try{
   const next=await getMusicianDirectory(token);
   if(id!==requestId.current)return;
   setMembers(next);setError('');
  }catch(e){if(id===requestId.current)setError(e instanceof Error?e.message:'No se pudo cargar Músicos.');}
  finally{if(id===requestId.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setMembers([]);setLoading(true);setError('');
  void refresh();
  const resume=()=>{if(!document.hidden&&navigator.onLine)void refresh();};
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);
  return()=>{requestId.current++;document.removeEventListener('visibilitychange',resume);
   window.removeEventListener('online',resume);};
 },[refresh]);
 useFamilyLive(token,false,()=>{void refresh();});
 return <section aria-label="Músicos autorizados" className="hn-musicians">
  <div className="hn-rep-toolbar"><strong>INTEGRANTES AUTORIZADOS</strong>
   <button type="button" onClick={()=>void refresh()}>Actualizar</button></div>
  {error&&<p role="alert" className="hn-cal-error">{error}</p>}
  {loading?<p className="hn-cal-empty">Cargando integrantes…</p>:
   members.length?<ul>{members.map(person=><li key={person.actorId}>
    <span aria-hidden="true">{person.name.charAt(0).toUpperCase()}</span> 
    <strong>{person.name}</strong>
   </li>)}</ul>:<p className="hn-cal-empty">No hay integrantes autorizados para mostrar.</p>}
 </section>;
}
