// Canonical server-event state projections for both HAVANA NICE V2 Chat clients.
// This module never owns WebSocket, storage, credentials or React state.
import type {ChatMessage,ChatReadReceipt,ChatReaction,ChatEmoji} from './index';

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

// Former index.ts projections, moved without changing reconciliation semantics.
export function reconcileUpdatedMessage(before: ChatMessage[], updated:ChatMessage):ChatMessage[] {
  return before.map(item => item.seq === updated.seq && updated.seq > 0 ? {...item,...updated,pending:false} : item);
}
export function reconcileDeletedMessage(before:ChatMessage[],seq:number):ChatMessage[]{
 return before.filter(m=>m.seq!==seq&&!m.deletedAt).map(m=>m.replyToSeq===seq?{...m,replyToSeq:null}:m);
}
export function reconcileChatSnapshot(before:ChatMessage[],server:ChatMessage[]):ChatMessage[]{
 const latest=server.filter(m=>!m.deletedAt),ids=new Set(latest.map(m=>m.seq));
 const min=latest.length?Math.min(...latest.map(m=>m.seq)):0;
 const max=latest.length?Math.max(...latest.map(m=>m.seq)):0;
 // Keep older pages and WebSocket messages that arrived after the GET began.
 return reconcileChatMessages(before.filter(m=>!m.deletedAt&&(m.pending||m.seq<=0||
 (min>0&&(m.seq<min||m.seq>max))||ids.has(m.seq))),latest);
}

export function reconcileReactions(before: ChatReaction[], event: {messageSeq: number;actorId: string;emoji: ChatEmoji;active: boolean}): ChatReaction[] {
  const kept = before.filter(x => !(x.messageSeq === event.messageSeq && x.actorId === event.actorId && x.emoji === event.emoji));
  return event.active ? [...kept, {messageSeq:event.messageSeq,actorId:event.actorId,emoji:event.emoji}] : kept;
}


export function reconcileChatMessages(
  before: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const message of [...before, ...incoming]) {
    const key = `${message.senderId}:${message.clientMessageId}`;
    const previous = map.get(key);
    // Later server snapshots must override stale edits/deletions in local memory.
    // Never allow a pending offline copy to overwrite a confirmed server row.
    if (!previous || (!message.pending && message.seq > 0) || (previous.pending && !message.pending)) {
      map.set(key, message);
    }
  }
  return [...map.values()].sort((a, b) => {
    if (a.seq && b.seq) return a.seq - b.seq;
    if (a.seq) return -1;
    if (b.seq) return 1;
    return a.sentAt.localeCompare(b.sentAt);
  });
}

