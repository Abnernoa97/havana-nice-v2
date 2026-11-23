import {useCallback,useEffect,useRef,useState} from 'react';
import {watchRepertoire} from '../../services/calendar-live';
import {getRepertoireSongs,safeRepertoireLink,repertoireSection,REPERTOIRE_SECTIONS,
 type RepertoireSection,type RepertoireSong} from '@havana/shared';
import './member-repertoire.css';

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
  <div className="hn-rep-toolbar hn-rep-heading">
   <h2>Repertorio general</h2><button type="button" onClick={()=>void refresh()}>Actualizar</button>
  </div>
  {!!error&&<p role="alert" className="hn-cal-error">{error}</p>}
  <div className="hn-rep-parchment"><div className="hn-rep-parchment-content">
   <div className="hn-rep-tabs" role="group" aria-label="Categorías de repertorio">
    {REPERTOIRE_SECTIONS.map(section=><button key={section} type="button"
     className={'hn-rep-tab'+(open===section?' is-open':'')}
     aria-expanded={open===section} aria-controls="hn-repertoire-list"
     onClick={()=>setOpen(v=>v===section?null:section)}>
     {section}<span aria-hidden="true">{open===section?'−':'+'}</span>
    </button>)}
   </div>
   {open&&<div id="hn-repertoire-list" className="hn-rep-song-list" role="region" aria-label={'Canciones: '+open}>
    {loading?<p className="hn-rep-empty">Cargando canciones…</p>:
     !visible.length?<p className="hn-rep-empty">No hay canciones en {open.toLowerCase()}.</p>:
     visible.map(song=><article key={song.id} className="hn-rep-row">
      <div><strong>{song.title}</strong>{song.artist&&<small>{song.artist}</small>}</div>
      {safeRepertoireLink(song.referenceUrl)&&<a target="_blank" rel="noopener noreferrer"
       href={safeRepertoireLink(song.referenceUrl)!}>REVISAR LINK ↗</a>}
     </article>)}
   </div>}
  </div></div>
  <p className="hn-rep-calendar-hint">El repertorio de cada evento está en Calendario, dentro de su fecha.</p>
 </section>;
}
