import React,{lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {parseNativeBookContext,type NativeBookContext} from './native-book-context';
import './native-book-reader.css';

// The exact same lazily loaded PageFlip renderer as the authorized PWA.
// No browser login, second renderer, URL token or persistent browser storage.
// One direct boot -> context delivery from the authorized Android shell.
const MemberBook=lazy(()=>import('../features/book/MemberBook'));
const CalendarMemories=lazy(()=>import('../features/calendar/CalendarMemories'));

type RNWindow=Window&{ReactNativeWebView?:{
 postMessage?:(message:string)=>void;
}};
// One-way rendering telemetry: no token, login or auth confirmation.
function reportReaderPhase(phase:'boot'|'session'|'pages'){
 try{
  (window as RNWindow).ReactNativeWebView?.postMessage?.(
   JSON.stringify({type:'havana-v2-book-phase',phase}));
 }catch{/* Only display telemetry; never send credentials. */}
}
function reportReaderStatus(status:'ready'|'error'){
 try{
  (window as RNWindow).ReactNativeWebView?.postMessage?.(
   JSON.stringify({type:'havana-v2-book-status',status}));
 }catch{/* No native bridge must never stop PWA rendering. */}
}
function useReaderDisplayStatus(){
 useEffect(()=>{
  const root=document.getElementById('book-root');
  if(!root)return;
  let last='';
  let lastPhase='';
  const sendPhase=(phase:'pages')=>{
   if(lastPhase!==phase){lastPhase=phase;reportReaderPhase(phase);}
  };
  const inspect=()=>{
   // Only the real StPageFlip stage (or its honest empty/error fallback)
   // can dismiss the native spinner. HTML onLoad is not enough.
   const content=root.querySelector('.hn-book-reader .stf__block, .hn-book-scroll, .hn-book-empty:not([role]), .hn-cal-memory-placeholder');
   const failure=root.querySelector('[role="alert"]');
   const state=content?'ready':failure?'error':'loading';
   if(state==='loading'){
    if(root.querySelector('.hn-family-empty, .hn-cal-memory-placeholder'))sendPhase('pages');
    return;
   }
   document.getElementById('book-boot-status')?.remove();
   if(last===state)return;
   last=state;
   reportReaderStatus(state);
  };
  const observer=new MutationObserver(inspect);
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  inspect();
  return()=>observer.disconnect();
 },[]);
}
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
// The receiving listener is installed BEFORE Android receives the boot signal.
// This avoids the Android-specific injectedObjectJson() race entirely.
function PrivateNativeReader(){
 useReaderDisplayStatus();
 const [context,setContext]=useState<NativeBookContext|null>(null);
 const [bridgeUnavailable,setBridgeUnavailable]=useState(false);
 useEffect(()=>{
  let received=false;
  const expiry=setTimeout(()=>{if(!received)setBridgeUnavailable(true);},8000);
  const onContext=(event:Event)=>{
   const detail=(event as CustomEvent<unknown>).detail;
   const next=parseNativeBookContext(typeof detail==='string'?detail:null);
   if(!next||received)return;
   received=true;clearTimeout(expiry);
   setBridgeUnavailable(false);
   setContext(next);
  };
  window.addEventListener('havana-v2-book-context',onContext);
  reportReaderPhase('boot');
  return()=>{
   clearTimeout(expiry);
   window.removeEventListener('havana-v2-book-context',onContext);
  };
 },[]);
 useEffect(()=>{if(context)reportReaderPhase('session');},[context]);
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
  </ReaderBoundary>:bridgeUnavailable?
  <div className="hn-book-empty" role="alert">
   No se pudo recibir la sesión autorizada de Android.
  </div>:null}
 </main>;
}
createRoot(document.getElementById('book-root')!).render(<PrivateNativeReader/>);
