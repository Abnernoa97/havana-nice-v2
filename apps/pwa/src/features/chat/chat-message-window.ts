import type {ChatMessage} from '@havana/shared';

// Rendering window only: data, pagination, receipts and unsent messages remain
// untouched in the single Chat engine. Newer/older pages overlap to keep context.
export const CHAT_MESSAGE_WINDOW_SIZE=120;
export const CHAT_MESSAGE_WINDOW_STEP=40;

export function chatWindowKey(message:ChatMessage):string {
 return message.senderId+':'+message.clientMessageId;
}

export function selectChatMessageWindow(
 messages:readonly ChatMessage[],endAnchorKey:string|null,
){
 const rows=messages.filter(message=>!message.deletedAt);
 const anchorIndex=endAnchorKey===null?-1:rows.findIndex(row=>chatWindowKey(row)===endAnchorKey);
 const end=endAnchorKey===null||anchorIndex<0?rows.length:anchorIndex+1;
 const start=Math.max(0,end-CHAT_MESSAGE_WINDOW_SIZE);
 return {
   start,end,total:rows.length,
   rows:rows.slice(start,end),
   hasOlder:start>0,
   hasNewer:end<rows.length,
 };
}

// The next page overlaps 80 current rows, so a visible bubble can be anchored
// while older rows appear above it. Never skip or duplicate a message.
export function previousChatWindowEnd(start:number,end:number){
 return Math.min(end,start+CHAT_MESSAGE_WINDOW_SIZE-CHAT_MESSAGE_WINDOW_STEP);
}
export function nextChatWindowEnd(end:number,total:number){
 return Math.min(total,end+CHAT_MESSAGE_WINDOW_STEP);
}
