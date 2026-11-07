import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import MemberBook from '../features/book/MemberBook';
import '../features/book/book.css';

type RNWindow=Window&{ReactNativeWebView?:{postMessage:(message:string)=>void}};
const TOK=/^[A-Za-z0-9_-]{40,100}$/;
function PrivateNativeReader(){
 const [token,setToken]=useState('');
 const [tick,setTick]=useState(0);
 useEffect(()=>{
  const receive=(event:Event)=>{
   const detail=(event as CustomEvent<unknown>).detail;
   if(typeof detail==='string'&&TOK.test(detail))setToken(detail);
  };
  const refresh=()=>setTick(t=>t+1);
  window.addEventListener('havana-v2-book-auth',receive);
  window.addEventListener('havana-v2-book-refresh',refresh);
  // The RN shell owns the existing musician session; neither the PWA nor
  // this page creates an alternate account, cookie or storage key.
  (window as RNWindow).ReactNativeWebView?.postMessage('havana-v2-book-ready');
  return()=>{
   window.removeEventListener('havana-v2-book-auth',receive);
   window.removeEventListener('havana-v2-book-refresh',refresh);
  };
 },[]);
 return <div className="hn-native-book-shell">
  {token?<MemberBook token={token} tick={tick}/>:
   <div className="hn-book-empty">Abre la revista desde la aplicación autorizada de HAVANA NICE.</div>}
 </div>;
}
createRoot(document.getElementById('book-root')!).render(<PrivateNativeReader/>);
