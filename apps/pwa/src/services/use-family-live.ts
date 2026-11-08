import {useEffect,useRef} from 'react';
import {openFamilyRealtime,FAMILY_WS_HANDSHAKE_TIMEOUT_MS} from '@havana/shared';

// Exactly one socket for the mounted Familia screen; no polling and no new backend.
// Reconnect immediately on foreground/online, with bounded retries after a drop.
export function useFamilyLive(token:string,admin:boolean,onChange:()=>void){
 const latest=useRef(onChange);
 latest.current=onChange;
 useEffect(()=>{
  let active=true;
  let socket:WebSocket|null=null;
  let retry:ReturnType<typeof setTimeout>|null=null;
  let watchdog:ReturnType<typeof setTimeout>|null=null;
  let delay=1000;
  const clear=()=>{
   if(retry!==null){clearTimeout(retry);retry=null;}
   if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
  };
  const connect=()=>{
   if(!active||document.hidden||!navigator.onLine)return;
   if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING))return;
   clear();
   try{
    const opened=openFamilyRealtime(token,admin,event=>{
     if(!active||socket!==opened)return;
     if(event.type==='family.ready'||event.type==='family.invalidate')latest.current();
    });
    socket=opened;
    watchdog=setTimeout(()=>{
     if(!active||socket!==opened||opened.readyState===WebSocket.OPEN)return;
     socket=null;try{opened.close();}catch{}
     clear();
     if(!document.hidden&&navigator.onLine){
      retry=setTimeout(connect,delay);
      delay=Math.min(20000,delay*2);
     }
    },FAMILY_WS_HANDSHAKE_TIMEOUT_MS);
    opened.onopen=()=>{
     if(active&&socket===opened){
      if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
      delay=1000;
     }
    };
    opened.onclose=event=>{
     if(!active||socket!==opened)return;
     socket=null;
     if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
     if(event.code===4003)return; // revoked; do not repeatedly reconnect.
     if(!document.hidden&&navigator.onLine){
      clear();
      retry=setTimeout(connect,delay);
      delay=Math.min(20000,delay*2);
     }
    };
    opened.onerror=()=>{if(active&&socket===opened)opened.close();};
   }catch{
    clear();
    retry=setTimeout(connect,delay);
    delay=Math.min(20000,delay*2);
   }
  };
  const resume=()=>{
   if(!active)return;
   if(document.hidden||!navigator.onLine){
    clear();
    const previous=socket;socket=null;
    if(previous&&previous.readyState!==WebSocket.CLOSED)previous.close();
    return;
   }
   latest.current();
   connect();
  };
  connect();
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume);
  window.addEventListener('offline',resume);
  return()=>{
   active=false;clear();
   document.removeEventListener('visibilitychange',resume);
   window.removeEventListener('online',resume);
   window.removeEventListener('offline',resume);
   socket?.close();
  };
 },[token,admin]);
}
