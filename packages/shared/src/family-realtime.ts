import {HAVANA_V2_DEV_API_BASE_URL} from './api-base';

// PWA and Android subscribe only while Familia is open.
// The existing Worker/ChatRoom sends invalidation signals, never private media.
export type FamilyRealtimeEvent={type:'family.ready'|'family.invalidate'};
export const FAMILY_WS_HANDSHAKE_TIMEOUT_MS=9000;
export function openFamilyRealtime(
 token:string,
 admin:boolean,
 onEvent:(event:FamilyRealtimeEvent)=>void,
):WebSocket{
 if(!/^[A-Za-z0-9_-]{40,128}$/.test(token))
  throw new Error('Sesión de Familia inválida');
 const url=HAVANA_V2_DEV_API_BASE_URL.replace(/^http/,'ws')+'/ws/family';
 const protocols=admin?['havana-v2-admin','admin.'+token]:
  ['havana-v2-family','session.'+token];
 const socket=new WebSocket(url,protocols);
 socket.addEventListener('message',event=>{
  try{
   const value=JSON.parse(String(event.data)) as Partial<FamilyRealtimeEvent>;
   if(value.type==='family.ready'||value.type==='family.invalidate')
    onEvent({type:value.type});
  }catch{/* Ignore unsupported events. Secure REST APIs remain authoritative. */}
 });
 return socket;
}
