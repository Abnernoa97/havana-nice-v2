import React,{lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {parseNativeBookContext} from './native-book-context';
import './native-book-reader.css';

// The exact same lazily loaded PageFlip renderer as the authorized PWA.
// No browser login, second renderer, URL token or asynchronous auth messages.
const MemberBook=lazy(()=>import('../features/book/MemberBook'));
const CalendarMemories=lazy(()=>import('../features/calendar/CalendarMemories'));

type RNWindow=Window&{ReactNativeWebView?:{injectedObjectJson?:()=>string}};
class ReaderBoundary extends React.Component<
 {children:React.ReactNode},{failed:boolean}
>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(this.state.failed)return <div className="hn-book-empty" role="alert">
   No se pudo iniciar la revista 3D en este dispositivo.
   <button type="button" onClick={()=>window.location.reload()}>Reintentar</button>
  </div>;
  return this.props.children;
 }
}
function PrivateNativeReader(){
 const [context]=useState(()=>{
  let json:string|undefined;
  try{json=(window as RNWindow).ReactNativeWebView?.injectedObjectJson?.();}
  catch{return null;}
  return parseNativeBookContext(json);
 });
 const [tick,setTick]=useState(0);
 useEffect(()=>{
  const refresh=()=>setTick(t=>t+1);
  window.addEventListener('havana-v2-book-refresh',refresh);
  return()=>window.removeEventListener('havana-v2-book-refresh',refresh);
 },[]);
 return <main className="hn-native-book-shell">
  {context?<ReaderBoundary key={context.memory?.eventId||'book'}>
   <Suspense fallback={<div className="hn-book-empty" role="status">Abriendo revista 3D…</div>}>
    {context.memory?<CalendarMemories token={context.token}
     eventId={context.memory.eventId} title={context.memory.title} revision={tick}/>:
     <MemberBook token={context.token} tick={tick}/>}
   </Suspense>
  </ReaderBoundary>:
  <div className="hn-book-empty" role="alert">
   No se pudo recibir la sesión autorizada de Android.
  </div>}
 </main>;
}
createRoot(document.getElementById('book-root')!).render(<PrivateNativeReader/>);
