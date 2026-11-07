// HAVANA NICE V2 · One isolated Calendar signal room, never a parallel calendar database.
// Only invalidation hints travel over sockets; D1 authorization remains authoritative.
// New SQLite-backed Durable Object named "calendar-v2". Separate from ChatRoom.
import {verifyAdminSession} from '../admin/admin-auth.js';
import {sha256Hex} from '../../shared/crypto-helpers.js';
const MEMBER=/^member:[a-z0-9_-]{1,64}$/i;
const SESSION=/^[A-Za-z0-9_-]{40,100}$/;
const ADMIN=/^[A-Za-z0-9_-]{40,128}$/;
export function calendarSocketIdentity(request){
 const protocols=(request.headers.get('sec-websocket-protocol')||'').split(',').map(x=>x.trim());
 if(!protocols.includes('havana-v2-calendar'))return null;
 const member=protocols.find(x=>x.startsWith('session.'))?.slice(8);
 const admin=protocols.find(x=>x.startsWith('admin.'))?.slice(6);
 if(member&&SESSION.test(member)&&!admin)return {role:'member',token:member};
 if(admin&&ADMIN.test(admin)&&!member)return {role:'admin',token:admin};
 return null;
}
async function calendarMember(env,token){
 if(!SESSION.test(token))return null;
 const row=await env.DB.prepare(
  'SELECT s.actor_id,s.expires_at FROM chat_sessions s JOIN chat_members m '+
  'ON m.actor_id=s.actor_id AND m.active=1 WHERE s.token_hash=? '+
  'AND EXISTS (SELECT 1 FROM chat_single_device_owners o WHERE '+
  'o.actor_id=m.actor_id AND o.token_hash=s.token_hash)'
 ).bind(await sha256Hex(token)).first();
 return row&&Number(row.expires_at)>Date.now()?row.actor_id:null;
}
export async function calendarSocketAuthorized(env,identity){
 if(!identity)return null;
 if(identity.role==='admin'){
  const req=new Request('https://internal/calendar-admin-check',{
   headers:{Authorization:'Bearer '+identity.token}});
  return await verifyAdminSession(req,env)?{role:'admin',actorId:null}:null;
 }
 const actorId=await calendarMember(env,identity.token);
 return actorId?{role:'member',actorId}:null;
}
export async function notifyCalendarClients(env,ids){
 if(!env.CALENDAR_ROOMS)return;
 const recipients=[...new Set(ids)].filter(id=>typeof id==='string'&&MEMBER.test(id));
 if(!recipients.length)return;
 try{
  await env.CALENDAR_ROOMS.get(env.CALENDAR_ROOMS.idFromName('calendar-v2')).fetch(
   'https://internal/calendar-changed',{method:'POST',body:JSON.stringify({recipients})});
 }catch{ /* The next authenticated fetch/reconnect recovers missed updates. */ }
}
export class CalendarRoom {
 constructor(_state,env){
  this.env=env;
  this.connections=new Map();
 }
 send(ws,data){
  try{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}catch{}
 }
 async fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/calendar-changed'&&request.method==='POST'){
   let data;try{data=await request.json();}catch{}
   if(!Array.isArray(data?.recipients))return Response.json({error:'Invalid calendar change'},{status:400});
   const affected=new Set(data.recipients.filter(x=>typeof x==='string'&&MEMBER.test(x)));
   for(const [socket,peer] of this.connections){
    if(peer.role==='member'&&!affected.has(peer.actorId))continue;
    // Avoid stale or revoked subscriptions; the websocket never contains event data.
    const current=await calendarSocketAuthorized(this.env,peer.identity).catch(()=>null);
    if(!current){
     try{socket.close(4003,'Access expired');}catch{}
     this.connections.delete(socket);continue;
    }
    this.send(socket,{type:'calendar.invalidate'});
   }
   return Response.json({ok:true});
  }
  if(path!=='/ws/calendar')return Response.json({error:'Not found'},{status:404});
  if((request.headers.get('upgrade')||'').toLowerCase()!=='websocket')
   return Response.json({error:'WebSocket required'},{status:426});
  const identity=calendarSocketIdentity(request);
  const peer=await calendarSocketAuthorized(this.env,identity);
  if(!peer)return Response.json({error:'Unauthorized'},{status:401});
  const pair=new WebSocketPair();
  const client=pair[0],server=pair[1];server.accept();
  this.connections.set(server,{...peer,identity});
  const cleanup=()=>this.connections.delete(server);
  server.addEventListener('close',cleanup);server.addEventListener('error',cleanup);
  return new Response(null,{status:101,webSocket:client,
   headers:{'Sec-WebSocket-Protocol':'havana-v2-calendar'}});
 }
}
