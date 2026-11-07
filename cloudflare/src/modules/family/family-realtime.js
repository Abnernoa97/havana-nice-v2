// One lightweight invalidation channel using the EXISTING ChatRoom Durable Object.
// Never transmit albums, credentials, private R2 keys or media files via sockets.
const ROOM='main-chat-v2';
export async function notifyFamilyClients(env){
 if(!env.CHAT_ROOMS)return;
 try{
  const stub=env.CHAT_ROOMS.get(env.CHAT_ROOMS.idFromName(ROOM));
  const response=await stub.fetch('https://internal/family-invalidate',{method:'POST'});
  if(!response.ok)throw Error('Familia realtime signal unavailable: '+response.status);
 }catch{
  // D1/R2 changes remain authoritative; the clients refresh on reconnect/foreground.
 }
}
