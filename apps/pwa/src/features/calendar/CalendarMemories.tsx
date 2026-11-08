import {useEffect,useState} from 'react';
import {BOOK_GRANT_RENEW_MS,getCalendarMemories,type CalendarMemoryPhoto} from '@havana/shared';
import BookReader from '../book/BookReader';
import './calendar-memories.css';

export default function CalendarMemories({token,eventId,title,revision=0,photoCount=0}:{
 token:string;eventId:string;title:string;revision?:number;photoCount?:number
}){
 const [photos,setPhotos]=useState<CalendarMemoryPhoto[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 const [renew,setRenew]=useState(0);
 useEffect(()=>{
  let active=true;
  setLoading(true);
  void getCalendarMemories(token,eventId).then(result=>{
   if(active){setPhotos(result);setError('');}
  }).catch(error=>{
   if(active)setError(error instanceof Error?error.message:'No se pudo cargar el recuerdo.');
  }).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[token,eventId,revision,photoCount,renew]);
 // As in BOOK, only renew expiring 10-minute private R2 capabilities after
 // eight minutes. Calendar's 60-second offline recovery does not write grants.
 useEffect(()=>{
  if(!photos.length)return;
  const timer=window.setTimeout(()=>{if(!document.hidden&&navigator.onLine)setRenew(n=>n+1);},
   BOOK_GRANT_RENEW_MS);
  return()=>window.clearTimeout(timer);
 },[photos]);
 if(loading)return <p className="hn-cal-memory-placeholder">Abriendo recuerdos…</p>;
 if(error)return <p role="alert" className="hn-cal-error">{error}</p>;
 if(!photos.length)return <p className="hn-cal-memory-placeholder">Las fotografías de este día aparecerán aquí cuando Administración las publique.</p>;
 return <div className="hn-cal-memory-gallery">
  <BookReader edition="calendar" coverTitle={title} pages={photos.map(p=>({
   id:p.id,url:p.url,fit:p.fit,position:p.position,published:true
  }))}/>
 </div>;
}
