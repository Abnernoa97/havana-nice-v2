// HAVANA NICE V2 · one isolated CalendarRoom subscription for native UI.
// No Chat socket, separate login, secret storage, polling timer or second backend.
import {AppState} from 'react-native';
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';

export function watchNativeCalendar(token:string,onInvalidate:()=>void,topic:'calendar'|'repertoire'='calendar'):()=>void{
 let disposed=false,connection:WebSocket|null=null;
 let retry:ReturnType<typeof setTimeout>|null=null;
 let watchdog:ReturnType<typeof setTimeout>|null=null,attempts=0;
 const url=API.replace(/^http/,'ws')+'/ws/calendar';
 const clear=()=>{
  if(retry!==null){clearTimeout(retry);retry=null;}
  if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
  const previous=connection;connection=null;
  if(previous){
   previous.onopen=null;previous.onmessage=null;previous.onclose=null;previous.onerror=null;
   try{previous.close();}catch{}
  }
 };
 const schedule=()=>{
  if(disposed||AppState.currentState!=='active'||retry!==null)return;
  const ms=Math.min(12000,650*Math.pow(2,Math.min(attempts++,4)));
  retry=setTimeout(()=>{retry=null;connect();},ms);
 };
 function connect(){
  if(disposed||AppState.currentState!=='active'||connection)return;
  let socket:WebSocket;
  try{socket=new WebSocket(url,['havana-v2-calendar','session.'+token]);}
  catch{schedule();return;}
  connection=socket;
  // Some Android devices leave a WSS handshake stuck in CONNECTING after a network switch.
  watchdog=setTimeout(()=>{if(connection===socket&&socket.readyState!==WebSocket.OPEN){
   clear();schedule();
  }},9000);
  socket.onopen=()=>{
   if(connection!==socket)return;
   if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
   attempts=0;onInvalidate();
  };
  socket.onmessage=e=>{
   if(connection!==socket)return;
   try{
    const event=JSON.parse(String(e.data)) as {type?:string};
    // Event assignment grants/revocations must refresh event repertoire too.
    if(event.type==='calendar.invalidate')onInvalidate();
    if(event.type==='repertoire.invalidate'&&topic==='repertoire')onInvalidate();
   }catch{}
  };
  socket.onclose=()=>{if(connection!==socket)return;clear();schedule();};
  socket.onerror=()=>{if(connection!==socket)return;clear();schedule();};
 }
 onInvalidate();connect();
 const subscription=AppState.addEventListener('change',state=>{
  if(state==='active'){clear();onInvalidate();connect();}
  else clear();
 });
 return ()=>{disposed=true;clear();subscription.remove();};
}

export function watchNativeRepertoire(token:string,onInvalidate:()=>void):()=>void{
 return watchNativeCalendar(token,onInvalidate,'repertoire');
}
