import {useCallback,useEffect,useRef,useState} from 'react';
import {watchRepertoire} from '../../services/calendar-live';
import {getRepertoireSongs,safeRepertoireLink,repertoireSection,REPERTOIRE_SECTIONS,
 type RepertoireSection,type RepertoireSong} from '@havana/shared';
import './member-repertoire.css';

// Catalog only: one open category; Calendar owns event-specific songs.
export default function MemberRepertoire({token}:{token:string}){
 const [songs,setSongs]=useState<RepertoireSong[]>([]);
 const [open,setOpen]=useState<RepertoireSection|null>('ENGLISH');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const requestId=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++requestId.current;
  try{
   const catalog=await getRepertoireSongs(token);
   if(id!==requestId.current)return;
   setSongs(catalog);setError('');
  }catch(e){if(id===requestId.current)setError(e instanceof Error?e.message:'No se pudo cargar Repertorio.');}
  finally{if(id===requestId.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setSongs([]);setOpen('ENGLISH');setLoading(true);setError('');
  void refresh();
  const stop=watchRepertoire(token,false,()=>{if(!document.hidden&&navigator.onLine)void refresh();});
  return()=>{++requestId.current;stop();};
 },[refresh,token]);
 const visible=open?songs.filter(song=>repertoireSection(song.category)===open):[];
 return <section className="hn-repertoire hn-member-repertoire" aria-label="Repertorio general">
  {!!error&&<p role="alert" className="hn-cal-error">{error}</p>}
  <div className="hn-rep-tabs" role="group" aria-label="Categorías de repertorio">
   {REPERTOIRE_SECTIONS.map(section=><button key={section} type="button"
    className={'hn-rep-tab'+(open===section?' is-open':'')}
    aria-expanded={open===section} aria-controls="hn-repertoire-list"
    onClick={()=>setOpen(v=>v===section?null:section)}>
    <span className="hn-rep-tab-title">{section}</span>
   </button>)}
  </div>
  {open&&<div className="hn-rep-drop" key={open} id="hn-repertoire-list"
    role="region" aria-label={'Canciones: '+open}>
   <div className="hn-rep-drop-inner">
    <div className="hn-rep-wave" aria-hidden="true">
     <svg className="hn-rep-wave-svg" viewBox="0 0 440 76" preserveAspectRatio="none" focusable="false">
      <defs>
       <linearGradient id="hn-rep-wave-gradient" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor="#548c6b" stopOpacity=".71"/>
        <stop offset="44%" stopColor="#cae4d2" stopOpacity=".88"/>
        <stop offset="75%" stopColor="#7cb491" stopOpacity=".66"/>
        <stop offset="100%" stopColor="#ecf6ed" stopOpacity=".32"/>
       </linearGradient>
      </defs>
      <path d="M-30 24 C55 -6 130 58 230 29 S390 -7 475 27 L475 77 L-30 77 Z" fill="url(#hn-rep-wave-gradient)"/>
      <path d="M-30 22 C55 -8 130 56 230 27 S390 -9 475 25" stroke="#f7fff5" strokeOpacity=".86" strokeWidth="2" fill="none"/>
     </svg>
    </div>
    <div className="hn-rep-song-list">
     {loading?<p className="hn-rep-empty">Cargando canciones…</p>:
      !visible.length?<p className="hn-rep-empty">No hay canciones en {open.toLowerCase()}.</p>:
      visible.map(song=><article key={song.id} className="hn-rep-row">
       <div><strong>{song.title}</strong>{song.artist&&<small>{song.artist}</small>}</div>
       {safeRepertoireLink(song.referenceUrl)&&<a target="_blank" rel="noopener noreferrer"
        href={safeRepertoireLink(song.referenceUrl)!}>REVISAR LINK ↗</a>}
      </article>)}
    </div>
   </div>
  </div>}
 </section>;
}
