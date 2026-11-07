// Canonical server-event state projections for both HAVANA NICE V2 Chat clients.
// This module never owns WebSocket, storage, credentials or React state.
import type {ChatReadReceipt,ChatReaction} from './index';

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

export function removeChatReactionsForMessage(
 before:ChatReaction[],seq:number,
):ChatReaction[]{
 return before.filter(reaction=>reaction.messageSeq!==seq);
}
