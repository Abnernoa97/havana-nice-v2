import type {ChatMessage} from '@havana/shared';

// Rendering window only: data, pagination, receipts and unsent messages remain
// untouched in the single Chat engine. Newer/older pages overlap to keep context.
export const CHAT_MESSAGE_WINDOW_SIZE=80;
export const CHAT_MESSAGE_WINDOW_STEP=24;

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

// The next page overlaps 56 current rows, so a visible bubble can be anchored
// while older rows appear above it. Never skip or duplicate a message.
export function previousChatWindowEnd(start:number,end:number){
 return Math.min(end,start+CHAT_MESSAGE_WINDOW_SIZE-CHAT_MESSAGE_WINDOW_STEP);
}
export function nextChatWindowEnd(end:number,total:number){
 return Math.min(total,end+CHAT_MESSAGE_WINDOW_STEP);
}

/** Only a recent user scroll may rotate the visible 120-message window.
 * Programmatic scrolls (initial open, ResizeObserver, restored anchors) are ignored.
 * A transition cooldown prevents two pages from flipping during the same gesture.
 */
export type ChatWindowEdgeAction='older'|'newer'|'latest'|null;
export function chatWindowEdgeAction(input:{
 scrollTop:number;
 scrollHeight:number;
 clientHeight:number;
 direction:-1|0|1;
 recentGesture:boolean;
 transitionBlocked:boolean;
 hasOlder:boolean;
 hasNewer:boolean;
 loadingOlder:boolean;
 readingHistory:boolean;
}):ChatWindowEdgeAction {
 if(!input.recentGesture||input.transitionBlocked||
   input.clientHeight<=0||input.scrollHeight<=input.clientHeight+1)return null;
 // iOS Safari rubber-band reports negative or beyond-end scroll offsets.
 // Never interpret those overshoot frames as a new pagination request.
 const maxScroll=input.scrollHeight-input.clientHeight;
 if(input.scrollTop<0||input.scrollTop>maxScroll+1)return null;
 if(input.direction<0&&input.scrollTop<=96&&
   input.hasOlder&&!input.loadingOlder)return 'older';
 const remaining=input.scrollHeight-input.scrollTop-input.clientHeight;
 if(input.direction>0&&remaining<=96){
   if(input.hasNewer)return 'newer';
   if(input.readingHistory&&remaining<=24)return 'latest';
 }
 return null;
}
