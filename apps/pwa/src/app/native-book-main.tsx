import React,{lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
// Boot the lightweight, authenticated bridge before downloading the 3D engine.
const MemberBook=lazy(()=>import('../features/book/MemberBook'));
const CalendarMemories=lazy(()=>import('../features/calendar/CalendarMemories'));
import '../features/book/book.css';

type RNWindow=Window&{ReactNativeWebView?:{postMessage:(message:string)=>void}};
const TOK=/^[A-Za-z0-9_-]{40,100}$/;
class ReaderBoundary extends React.Component<
 {children:React.ReactNode},{failed:boolean}
>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(this.state.failed)return <div className="hn-book-empty" role="alert">
   No se pudo iniciar el lector 3D en este dispositivo.
   <button type="button" onClick={()=>window.location.reload()}
    style={{display:'block',margin:'16px auto',padding:'11px 24px'}}>
    Reintentar BOOK
   </button>
  </div>;
  return this.props.children;
 }
}
function PrivateNativeReader(){
 const [token,setToken]=useState('');
 const [tick,setTick]=useState(0);
 const [memory,setMemory]=useState<{eventId:string;title:string}|null>(null);
 useEffect(()=>{
  const receive=(event:Event)=>{
   const detail=(event as CustomEvent<unknown>).detail;
   if(typeof detail==='string'&&TOK.test(detail))setToken(detail);
  };
  const refresh=()=>setTick(t=>t+1);
  const receiveMemory=(event:Event)=>{
   const detail=(event as CustomEvent<unknown>).detail;
   if(!detail||typeof detail!=='object')return;
   const item=detail as {eventId?:unknown;title?:unknown};
   if(typeof item.eventId!=='string'||!(/^[0-9a-f-]{36}$/i.test(item.eventId)))return;
   const title=typeof item.title==='string'?item.title.slice(0,160):'';
   setMemory({eventId:item.eventId,title});
  };
  window.addEventListener('havana-v2-book-auth',receive);
  window.addEventListener('havana-v2-book-calendar',receiveMemory);
  window.addEventListener('havana-v2-book-refresh',refresh);
  // The RN shell owns the existing musician session; neither the PWA nor
  // this page creates an alternate account, cookie or storage key.
  (window as RNWindow).ReactNativeWebView?.postMessage('havana-v2-book-ready');
  return()=>{
   window.removeEventListener('havana-v2-book-auth',receive);
   window.removeEventListener('havana-v2-book-refresh',refresh);
   window.removeEventListener('havana-v2-book-calendar',receiveMemory);
  };
 },[]);
 return <div className="hn-native-book-shell">
  {token?<ReaderBoundary key={memory?.eventId||'book'}>
    <Suspense fallback={<div className="hn-book-empty" role="status">Preparando el lector 3D…</div>}>
     {memory?<CalendarMemories token={token} eventId={memory.eventId} title={memory.title} revision={tick}/>:<MemberBook token={token} tick={tick}/>}
    </Suspense>
   </ReaderBoundary>:
   <div className="hn-book-empty">Abre la revista desde la aplicación autorizada de HAVANA NICE.</div>}
 </div>;
}
createRoot(document.getElementById('book-root')!).render(<PrivateNativeReader/>);
