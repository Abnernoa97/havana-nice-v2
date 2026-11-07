// HAVANA NICE V2 — authenticated Admin invalidation channel, no private payloads.
// Only the Worker invokes the Durable Object internal refresh endpoint.
// A browser token is passed via WebSocket subprotocol, never URL or storage.
const ADMIN_PROTOCOL='havana-v2-admin';
const ADMIN_TOKEN=/^[A-Za-z0-9_-]{40,128}$/;
export function adminSocketToken(request){
 const protocols=(request.headers.get('sec-websocket-protocol')||'').split(',').map(p=>p.trim());
 if(!protocols.includes(ADMIN_PROTOCOL))return '';
 const value=protocols.find(p=>p.startsWith('admin.'))?.slice(6)||'';
 return ADMIN_TOKEN.test(value)?value:'';
}
export function adminTokenRequest(token){
 return new Request('https://internal/admin-session-check',{headers:{authorization:'Bearer '+token}});
}
export async function notifyAdminClients(env,topic){
 if(!['members'].includes(topic))return;
 // Event is a topic invalidation only: never transmit names, device IDs or tokens.
 try{
  await env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName('main-chat-v2')).fetch(
   'https://internal/admin-invalidate',
   {method:'POST',body:JSON.stringify({topic})});
 }catch{/* D1 remains authoritative; refresh-on-resume covers missed signals. */}
}
