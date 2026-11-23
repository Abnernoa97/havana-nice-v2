// Single outgoing edit/delete policy. Controllers retain socket, draft and timers.
import type {ChatMessage} from './index';
import {isWithinChatEditWindow} from './chat-menu';
export const CHAT_EDIT_ACK_TIMEOUT_MS=10_000;
export type ChatEditDecision='pending'|'empty'|'unchanged'|'expired'|'ready';
export function checkChatEditDecision(
 editing:Pick<ChatMessage,'text'|'sentAt'>,text:string,pending:boolean,now=Date.now(),
):ChatEditDecision{
 if(pending)return 'pending';
 if(!text)return 'empty';
 if(text===editing.text)return 'unchanged';
 if(!isWithinChatEditWindow(editing.sentAt,now))return 'expired';
 return 'ready';
}
export function chatEditPayload(seq:number,text:string):string{
 return JSON.stringify({type:'chat.edit',seq,text});
}
export function chatDeletePayload(seq:number):string{
 return JSON.stringify({type:'chat.delete',seq});
}
