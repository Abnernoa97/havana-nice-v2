// One pure Chat presence-event format for PWA and Android.
// The application shell retains its only WebSocket, clock and connection state.
import type {ChatEmoji} from './index';

export const CHAT_TYPING_THROTTLE_MS=1700;

// Browser visibility/Android lifecycle remain platform-owned: this is just
// the shared protocol shape for an acknowledged read sequence.
export function chatReadReceiptPayload(seq:number):string|null{
 return seq>0?JSON.stringify({type:'chat.read',seq}):null;
}

export function chatReactionPayload(seq:number,emoji:ChatEmoji):string|null{
 return seq>0?JSON.stringify({type:'chat.react',messageSeq:seq,emoji}):null;
}

// The original clients broadcast only after >1700ms, not at the boundary.
export function chatTypingPayload(value:string,now:number,lastSent:number):string|null{
 return now-lastSent>CHAT_TYPING_THROTTLE_MS
  ?JSON.stringify({type:'chat.typing',active:!!value.trim()}):null;
}
