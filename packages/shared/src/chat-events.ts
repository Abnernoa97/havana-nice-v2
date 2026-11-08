// Canonical server-event state projections for both HAVANA NICE V2 Chat clients.
// This module never owns WebSocket, storage, credentials or React state.
import type {ChatMessage,ChatReadReceipt,ChatReaction} from './index';

export function reconcileChatReadReceipt(
 before:ChatReadReceipt[],
 event:Pick<ChatReadReceipt,'actorId'|'displayName'|'seq'>,
):ChatReadReceipt[]{
 return [...before.filter(receipt=>receipt.actorId!==event.actorId),{
  actorId:event.actorId,
  displayName:event.displayName,
  seq:Math.max(event.seq,before.find(receipt=>receipt.actorId===event.actorId)?.seq||0),
 }];
}

// Filter stale pages, search results and delayed socket messages after deletion.
// Pure projection: the existing Chat owner keeps the deletion marker.
export function withoutRemovedChatMessages(messages:ChatMessage[],removed:ReadonlySet<number>):ChatMessage[]{
 return messages.filter(message=>!message.deletedAt&&!removed.has(message.seq));
}

export function removeChatReactionsForMessage(
 before:ChatReaction[],seq:number,
):ChatReaction[]{
 return before.filter(reaction=>reaction.messageSeq!==seq);
}
