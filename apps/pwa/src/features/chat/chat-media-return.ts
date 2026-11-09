// Local navigation hint only. Never store the member token or private media here.
// Safari may recreate the PWA after returning from the system camera.
const KEY='hn-v2-chat-return-v1';
export const CHAT_RETURN_MAX_AGE_MS=60*60*1000;
export function readChatReturnIntent(storage:Pick<Storage,'getItem'|'removeItem'>,now=Date.now()):boolean {
 try{
   const raw=storage.getItem(KEY);
   if(!raw)return false;
   const data=JSON.parse(raw) as {at?:unknown};
   if(typeof data.at!=='number'||data.at>now||now-data.at>CHAT_RETURN_MAX_AGE_MS){
     storage.removeItem(KEY);return false;
   }
   return true;
 }catch{return false;}
}
export function writeChatReturnIntent(storage:Pick<Storage,'setItem'|'removeItem'>,open:boolean,now=Date.now()):void {
 try{
   if(open)storage.setItem(KEY,JSON.stringify({at:now}));
   else storage.removeItem(KEY);
 }catch{/* Private browsing may disable local storage; current UI still works. */}
}
