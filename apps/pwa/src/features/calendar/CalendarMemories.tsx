import {useEffect,useState} from 'react';
import {getCalendarMemories,type CalendarMemoryPhoto} from '@havana/shared';
import BookReader from '../book/BookReader';

export default function CalendarMemories({token,eventId,title,revision=0}:{
 token:string;eventId:string;title:string;revision?:number
}){
 const [photos,setPhotos]=useState<CalendarMemoryPhoto[]>([]);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;
  setLoading(true);
  void getCalendarMemories(token,eventId).then(result=>{
   if(active){setPhotos(result);setError('');}
  }).catch(error=>{
   if(active)setError(error instanceof Error?error.message:'No se pudo cargar el recuerdo.');
  }).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[token,eventId,revision]);
 if(loading)return <p className="hn-cal-memory-placeholder">Abriendo recuerdos…</p>;
 if(error)return <p role="alert" className="hn-cal-error">{error}</p>;
 if(!photos.length)return <p className="hn-cal-memory-placeholder">Las fotografías de este día aparecerán aquí cuando Administración las publique.</p>;
 return <div className="hn-cal-memory-gallery">
  <BookReader edition="calendar" coverTitle={title} pages={photos.map(p=>({
   id:p.id,url:p.url,fit:p.fit,position:p.position,published:true
  }))}/>
 </div>;
}
