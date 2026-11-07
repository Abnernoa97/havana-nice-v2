// Only the serialization policy is shared. PWA keeps IndexedDB and native
// Android keeps its existing private SQLite key; neither storage engine is changed.
import type {ChatMessage,ChatSession} from './index';

export interface ChatOfflineSnapshot {
 session:ChatSession;
 outbox:ChatMessage[];
 draft?:string;
 editing?:ChatMessage|null;
 beforeEdit?:{draft:string;replyTo:ChatMessage|null}|null;
}

export function captureChatOfflineSnapshot(
 session:ChatSession|null,
 outbox:Iterable<ChatMessage>,
 draft:string,
 editing:ChatMessage|null,
 beforeEdit:{draft:string;replyTo:ChatMessage|null}|null,
):ChatOfflineSnapshot|null{
 if(!session)return null;
 return {
  session,
  outbox:[...outbox].map(message=>({...message,pending:true,deliveryStatus:'queued' as const})),
  draft,editing,beforeEdit,
 };
}

// Preserve all client message IDs and creation order, even after reconnection.
// Re-queue in-flight messages rather than losing them or generating new IDs.
export function restoreChatOfflineOutbox(
 outbox:ChatMessage[],
):Map<string,ChatMessage>{
 return new Map(outbox.map(message=>[
  message.clientMessageId,{...message,pending:true,deliveryStatus:'queued' as const},
 ]));
}
