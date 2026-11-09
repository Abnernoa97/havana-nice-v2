// One delivery/ACK lifecycle shared by PWA and Android. Both apps retain
// their original WebSocket, pending-message Map and timer Map.
import type {ChatMessage} from './index';
import {CHAT_ACK_TIMEOUT_MS,selectNextQueuedChatMessage,type ChatOutboxState} from './chat-outbox.ts';

export type ChatAckTimer=ReturnType<typeof setTimeout>;
export type ChatAckScheduler={
 start:(callback:()=>void,delay:number)=>ChatAckTimer;
 clear:(timer:ChatAckTimer)=>void;
};
const systemScheduler:ChatAckScheduler={
 start:(callback,delay)=>setTimeout(callback,delay),
 clear:timer=>clearTimeout(timer),
};
type SendSocket=Pick<WebSocket,'readyState'|'send'>;
type OnStatus=(id:string,state:ChatOutboxState)=>void;

export function clearChatAckTimer(
 timers:Map<string,ChatAckTimer>,id:string,scheduler:ChatAckScheduler=systemScheduler,
):void{
 const timer=timers.get(id);
 if(timer!==undefined)scheduler.clear(timer);
 timers.delete(id);
}

export function pauseChatOutbox(
 outbox:Map<string,ChatMessage>,timers:Map<string,ChatAckTimer>,
 onStatus:OnStatus,scheduler:ChatAckScheduler=systemScheduler,
):void{
 for(const timer of timers.values())scheduler.clear(timer);
 timers.clear();
 for(const id of outbox.keys())onStatus(id,'queued');
}

export function confirmChatOutgoingMessage(
 message:ChatMessage,actorId:string|undefined,
 outbox:Map<string,ChatMessage>,timers:Map<string,ChatAckTimer>,
 scheduler:ChatAckScheduler=systemScheduler,
):boolean{
 if(message.pending||message.senderId!==actorId)return false;
 outbox.delete(message.clientMessageId);
 clearChatAckTimer(timers,message.clientMessageId,scheduler);
 return true;
}

export function flushChatOutbox(
 socket:SendSocket|null,
 outbox:Map<string,ChatMessage>,timers:Map<string,ChatAckTimer>,
 onStatus:OnStatus,scheduler:ChatAckScheduler=systemScheduler,
):boolean{
 // WebSocket.OPEN is 1 on both platforms.
 if(!socket||socket.readyState!==1)return false;
 const item=selectNextQueuedChatMessage(outbox.values());
 if(!item)return false;
 const id=item.clientMessageId;
 try{
  socket.send(JSON.stringify({
   type:'chat.send',clientMessageId:id,text:item.text,
   replyToSeq:item.replyToSeq||null,
  }));
  onStatus(id,'sending');
  clearChatAckTimer(timers,id,scheduler);
  timers.set(id,scheduler.start(()=>{
   timers.delete(id);
   onStatus(id,'error');
  },CHAT_ACK_TIMEOUT_MS));
  return true;
 }catch{
  onStatus(id,'error');
  return false;
 }
}
