// HAVANA NICE V2 · single Calendar websocket client for musician/Admin PWA.
// D1 remains the authoritative read API; socket only invalidates visible calendars.
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
const MEMBER=/^[A-Za-z0-9_-]{40,100}$/;
const ADMIN=/^[A-Za-z0-9_-]{40,128}$/;
export function watchCalendar(token:string,admin:boolean,onInvalidate:(reason?:'fallback')=>void,topic:'calendar'|'repertoire'='calendar'):()=>void{
 if(!(admin?ADMIN:MEMBER).test(token))return ()=>{};
 const address=API.replace(/^http/,'ws')+'/ws/calendar';
 let socket:WebSocket|null=null,closed=false,retry:ReturnType<typeof setTimeout>|null=null;
 let watchdog:ReturnType<typeof setTimeout>|null=null,attempt=0;
 const clear=()=>{
  if(retry!==null){clearTimeout(retry);retry=null;}
  if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
 };
 const disconnect=()=>{
  clear();
  const existing=socket;socket=null;
  if(existing){existing.onopen=null;existing.onmessage=null;existing.onclose=null;existing.onerror=null;
   try{existing.close();}catch{}}
 };
 const schedule=()=>{
  if(closed||document.hidden||!navigator.onLine)return;
  if(retry!==null)return;
  const delay=Math.min(12000,650*Math.pow(2,Math.min(attempt++,4)));
  retry=setTimeout(()=>{retry=null;connect();},delay);
 };
 function connect(){
  if(closed||document.hidden||!navigator.onLine||socket)return;
  let next:WebSocket;
  try{next=new WebSocket(address,['havana-v2-calendar',(admin?'admin.':'session.')+token]);}
  catch{schedule();return;}
  socket=next;
  // iOS Safari may stall a reconnect at CONNECTING after backgrounding.
  watchdog=setTimeout(()=>{if(socket===next&&next.readyState!==WebSocket.OPEN){
   disconnect();schedule();
  }},9000);
  next.onopen=()=>{
   if(socket!==next)return;
   attempt=0;
   if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
   onInvalidate(); // recover changes made before subscribing
  };
  next.onmessage=event=>{
   if(socket!==next)return;
   try{
    const message=JSON.parse(String(event.data)) as {type?:string};
    if(message.type==='calendar.invalidate'&&topic==='calendar')onInvalidate();
    if(message.type==='repertoire.invalidate'&&topic==='repertoire')onInvalidate();
   }catch{}
  };
  next.onclose=()=>{if(socket!==next)return;disconnect();schedule();};
  next.onerror=()=>{if(socket!==next)return;disconnect();schedule();};
 }
 const resume=()=>{
  if(closed||document.hidden)return;
  // Safari may report an old socket as OPEN after restoring the installed PWA.
  disconnect();onInvalidate();connect();
 };
 const visibility=()=>{
  if(document.hidden)disconnect();
  else resume();
 };
 const online=()=>resume();
 const offline=()=>disconnect();
 const foreground=()=>resume();
 const pageShow=(event:PageTransitionEvent)=>{if(event.persisted)resume();};
 // One fallback for both PWA roles: recover missed pushes without old 4-second polling.
 const fallback=window.setInterval(()=>{
  if(!document.hidden&&navigator.onLine)onInvalidate('fallback');
 },60000);
 document.addEventListener('visibilitychange',visibility);
 window.addEventListener('online',online);
 window.addEventListener('offline',offline);
 window.addEventListener('focus',foreground);
 window.addEventListener('pageshow',pageShow);
 connect();
 return ()=>{
  closed=true;window.clearInterval(fallback);disconnect();
  document.removeEventListener('visibilitychange',visibility);
  window.removeEventListener('online',online);
  window.removeEventListener('offline',offline);
  window.removeEventListener('focus',foreground);
  window.removeEventListener('pageshow',pageShow);
 };
}

// Same private CalendarRoom transport; no new socket engine.
export function watchRepertoire(token:string,admin:boolean,onInvalidate:(reason?:'fallback')=>void):()=>void{
 return watchCalendar(token,admin,onInvalidate,'repertoire');
}
