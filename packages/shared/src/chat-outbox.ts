// Canonical offline Chat delivery policy shared by Android and the iPhone PWA.
// Storage, socket lifecycle, and platform-specific timers stay in their respective apps.
import type {ChatMessage,ChatSession} from './index';

export const CHAT_ACK_TIMEOUT_MS=12_000;
export type ChatOutboxState='queued'|'sending'|'error';

// One offline message shape for Android and PWA. Each owner supplies its own
// already-generated ID and timestamp; this policy never owns a socket or disk.
export function createQueuedChatMessage(
 session:Pick<ChatSession,'actorId'|'displayName'>,text:string,
 replyToSeq:number|null,clientMessageId:string,sentAt:string,
):ChatMessage{
 return {
  seq:0,clientMessageId,senderId:session.actorId,senderName:session.displayName,
  text,sentAt,pending:true,deliveryStatus:'queued',replyToSeq,
 };
}

// Preserve the original ordering and backpressure behavior: an in-flight ACK
// blocks later items; error messages must be retried explicitly, not skipped.
export function selectNextQueuedChatMessage(outbox:Iterable<ChatMessage>):ChatMessage|null{
 const ordered=[...outbox].sort((a,b)=>a.sentAt.localeCompare(b.sentAt));
 if(ordered.some(item=>item.deliveryStatus==='sending'))return null;
 const first=ordered[0];
 return first?.deliveryStatus==='queued'?first:null;
}

// Update the original outbox Map in place (exactly as each old App did).
// Return the previous row so the optimistic chat UI updates only its own bubble.
export function setOutgoingChatStatus(
 outbox:Map<string,ChatMessage>,id:string,state:ChatOutboxState
):ChatMessage|null{
 const original=outbox.get(id);
 if(!original)return null;
 outbox.set(id,{...original,deliveryStatus:state,failed:state==='error'});
 return original;
}

export function projectOutgoingChatStatus(
 messages:ChatMessage[],original:ChatMessage,state:ChatOutboxState
):ChatMessage[]{
 return messages.map(m=>
  m.clientMessageId===original.clientMessageId&&m.senderId===original.senderId&&m.pending
    ? {...m,deliveryStatus:state,failed:state==='error'} : m
 );
}
