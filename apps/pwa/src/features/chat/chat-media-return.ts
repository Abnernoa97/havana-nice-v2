// Single-use camera recovery only. Normal launches always enter Home.
// Stores no media, credentials, tokens, or member identifiers.
const KEY='hn-v2-camera-return-v2';
const OLD_KEY='hn-v2-chat-return-v1';
export const CHAT_RETURN_MAX_AGE_MS=5*60*1000;

export function readChatReturnIntent(storage:Pick<Storage,'getItem'|'removeItem'>,now=Date.now()):boolean {
 try{
   storage.removeItem(OLD_KEY);
   const raw=storage.getItem(KEY);
   if(!raw)return false;
   storage.removeItem(KEY);
   const item=JSON.parse(raw) as {at?:unknown;purpose?:unknown};
   return item.purpose==='camera'&&typeof item.at==='number'&&
     item.at<=now&&now-item.at<=CHAT_RETURN_MAX_AGE_MS;
 }catch{return false;}
}

export function writeChatReturnIntent(storage:Pick<Storage,'setItem'|'removeItem'>,open:boolean,now=Date.now()):void {
 try{
   storage.removeItem(OLD_KEY);
   if(open)storage.setItem(KEY,JSON.stringify({at:now,purpose:'camera'}));
   else storage.removeItem(KEY);
 }catch{/* If storage is unavailable, live Chat navigation still works. */}
}
