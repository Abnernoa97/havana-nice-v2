// One event-routing policy for PWA and Android. Each client still owns
// its WebSocket, React state, timers, drafts and private sessions.
import type {ChatMessage,ChatReaction,ChatReadReceipt,ChatServerEvent} from './index';
import {
 reconcileUpdatedMessage,reconcileDeletedMessage,reconcileReactions,
 reconcileChatMessages,reconcileChatReadReceipt,removeChatReactionsForMessage,
} from './chat-events.ts';

type Update<T>=(projection:(current:T)=>T)=>void;
export type ChatIncomingEffects={
 actorId:string;
 removedSeq:Set<number>;
 setOnlineActorIds:(ids:ReadonlySet<string>)=>void;
 setTyping:(label:string,active:boolean)=>void;
 setMessages:Update<ChatMessage[]>;
 setReactions:Update<ChatReaction[]>;
 setReceipts:Update<ChatReadReceipt[]>;
 onUpdated:(message:ChatMessage)=>boolean;
 onUpdatedRemoved:(seq:number)=>void;
 onUpdatedSuccess:()=>void;
 onDeleted:(seq:number)=>void;
 onConfirmed:(message:ChatMessage)=>void;
 onMessageReceived:(seq:number)=>void;
 onRevoked:()=>void;
 onError:(reason:string)=>void;
};

export function applyChatIncomingEvent(value:ChatServerEvent,fx:ChatIncomingEffects):void{
 switch(value.type){
  case 'chat.ready':
  case 'chat.presence':
   fx.setOnlineActorIds(new Set((value.users??[]).map(user=>user.actorId)));
   return;
  case 'chat.typing':
   if(value.actorId!==fx.actorId)
    fx.setTyping(value.active?`${value.senderName} está escribiendo…`:'',value.active);
   return;
  case 'chat.updated':{
   const message=value.message;
   if(message.deletedAt)fx.removedSeq.add(message.seq);
   fx.setMessages(before=>message.deletedAt?
     reconcileDeletedMessage(before,message.seq):reconcileUpdatedMessage(before,message));
   const editFailed=fx.onUpdated(message);
   if(message.deletedAt){
    fx.setReactions(before=>removeChatReactionsForMessage(before,message.seq));
    fx.onUpdatedRemoved(message.seq);
   }
   if(!editFailed)fx.onUpdatedSuccess();
   return;
  }
  case 'chat.deleted':
   fx.removedSeq.add(value.seq);
   fx.setMessages(before=>reconcileDeletedMessage(before,value.seq));
   fx.setReactions(before=>removeChatReactionsForMessage(before,value.seq));
   fx.onDeleted(value.seq);
   return;
  case 'chat.read':
   fx.setReceipts(before=>reconcileChatReadReceipt(before,value));
   return;
  case 'chat.reaction':
   if(!fx.removedSeq.has(value.messageSeq))
    fx.setReactions(before=>reconcileReactions(before,value));
   return;
  case 'chat.message':
   fx.onConfirmed(value.message);
   fx.setMessages(before=>fx.removedSeq.has(value.message.seq)?before:
     reconcileChatMessages(before,[value.message]));
   fx.onMessageReceived(value.message.seq);
   return;
  case 'chat.revoked':
   fx.onRevoked();
   return;
  case 'chat.error':
   fx.onError(value.error);
   return;
 }
}
