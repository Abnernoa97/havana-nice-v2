import {useCallback,useEffect,useRef,useState} from 'react';
import {BOOK_GRANT_RENEW_MS,getBookPages,type BookPage} from '@havana/shared';
import BookReader from './BookReader';

export default function MemberBook({token,tick=0}:{token:string;tick?:number}){
 const [pages,setPages]=useState<BookPage[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const version=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++version.current;
  try{
   const result=await getBookPages(token);
   if(id===version.current){setPages(result);setError('');}
  }catch(e){
   if(id===version.current)setError(e instanceof Error?e.message:'No se pudo abrir el libro.');
  }finally{if(id===version.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  void refresh();
  const resume=()=>{if(!document.hidden)void refresh();};
  window.addEventListener('online',resume);
  document.addEventListener('visibilitychange',resume);
  return()=>{version.current++;window.removeEventListener('online',resume);
   document.removeEventListener('visibilitychange',resume);};
 },[refresh,tick]);
 // One renewal ahead of the Worker's expiring R2 grants. The magazine stays
 // mounted, so a long reading session never flashes blank after ten minutes.
 useEffect(()=>{
  if(!pages.length)return;
  const timer=window.setTimeout(()=>{
   if(!document.hidden&&navigator.onLine)void refresh();
  },BOOK_GRANT_RENEW_MS);
  return()=>window.clearTimeout(timer);
 },[pages,refresh]);
 return <section aria-label="BOOK HAVANA NICE">
  {error?<p className="hn-book-admin-error" role="alert">{error}</p>:null}
  {loading?<p className="hn-family-empty">Preparando la revista…</p>:<BookReader pages={pages}/>}
 </section>;
}
