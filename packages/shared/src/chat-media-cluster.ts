// Group consecutive photos/videos into a visual album, without changing the
// separate ChatRoom messages, delivery receipts, retry IDs or R2 assets.
import type {ChatMessage} from './index';

export const CHAT_MEDIA_CLUSTER_LIMIT=5;
export const CHAT_MEDIA_CLUSTER_GAP_MS=8*60*1000;

/** Chronological groups; each original message remains independently actionable. */
export function groupChatMediaMessages(messages:readonly ChatMessage[]):ChatMessage[][]{
 const groups:ChatMessage[][]=[];
 for(const message of messages){
  const last=groups[groups.length-1];
  const previous=last?.[last.length-1];
  const first=last?.[0];
  const a=previous?Date.parse(previous.sentAt):NaN;
  const b=Date.parse(message.sentAt);
  const adjacent=!!previous&&!!first&&!!previous.media&&!!message.media&&
   !previous.deletedAt&&!message.deletedAt&&!previous.replyToSeq&&!message.replyToSeq&&
   previous.senderId===message.senderId&&first.senderId===message.senderId&&
   last.length<CHAT_MEDIA_CLUSTER_LIMIT&&
   Number.isFinite(a)&&Number.isFinite(b)&&b>=a&&b-a<=CHAT_MEDIA_CLUSTER_GAP_MS;
  if(adjacent)last!.push(message);
  else groups.push([message]);
 }
 return groups;
}
