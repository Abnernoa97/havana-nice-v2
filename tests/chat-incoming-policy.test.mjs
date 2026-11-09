import test from 'node:test';
import assert from 'node:assert/strict';
import {applyChatIncomingEvent} from '../packages/shared/src/chat-incoming.ts';

const msg=(seq=2)=>({seq,clientMessageId:'id'+seq,senderId:'member:fer',senderName:'Fer',text:'hola',sentAt:'2026-11-01T00:00:00Z'});
function state(){
 const s={ids:new Set(),typing:'',messages:[msg(2),{...msg(3),replyToSeq:2}],reactions:[],receipts:[],deleted:new Set(),updates:[],flags:[],read:[]};
 const fx={
 actorId:'member:fer',removedSeq:s.deleted,
 setOnlineActorIds:ids=>s.ids=ids,
 setTyping:(label,active)=>{s.typing=label;s.flags.push(['typing',active]);},
 setMessages:project=>s.messages=project(s.messages),
 setReactions:project=>s.reactions=project(s.reactions),
 setReceipts:project=>s.receipts=project(s.receipts),
 onUpdated:message=>{s.updates.push(message);return false;},
 onUpdatedRemoved:seq=>s.flags.push(['updatedRemoved',seq]),
 onUpdatedSuccess:()=>s.flags.push('clear-error'),
 onDeleted:seq=>s.flags.push(['deleted',seq]),
 onConfirmed:message=>s.flags.push(['confirmed',message.seq]),
 onMessageReceived:seq=>s.read.push(seq),
 onRevoked:()=>s.flags.push('revoked'),
 onError:error=>s.flags.push(['error',error]),
 };return {s,fx};
}
test('ready/presence and typing ignore the current actor',()=>{
 const {s,fx}=state();
 applyChatIncomingEvent({type:'chat.ready',at:'now',users:[{actorId:'member:noa',displayName:'Noa'}]},fx);
 assert.deepEqual([...s.ids],['member:noa']);
 applyChatIncomingEvent({type:'chat.typing',actorId:'member:fer',senderName:'Fer',active:true,expiresAt:10},fx);
 assert.equal(s.typing,'');
 applyChatIncomingEvent({type:'chat.typing',actorId:'member:noa',senderName:'Noa',active:true,expiresAt:10},fx);
 assert.equal(s.typing,'Noa está escribiendo…');
});
test('deletion removes bubbles and reactions without losing reply context',()=>{
 const {s,fx}=state();
 s.reactions=[{messageSeq:2,actorId:'member:noa',emoji:'❤️'}];
 applyChatIncomingEvent({type:'chat.deleted',seq:2},fx);
 assert.deepEqual(s.messages.map(x=>x.seq),[3]);
 assert.equal(s.messages[0].replyToSeq,null);
 assert.deepEqual(s.reactions,[]);
 applyChatIncomingEvent({type:'chat.reaction',messageSeq:2,actorId:'member:noa',emoji:'❤️',active:true},fx);
 assert.equal(s.reactions.length,0);
});
test('read receipts never regress and message confirmation reaches one callback',()=>{
 const {s,fx}=state();
 applyChatIncomingEvent({type:'chat.read',actorId:'member:noa',displayName:'Noa',seq:20},fx);
 applyChatIncomingEvent({type:'chat.read',actorId:'member:noa',displayName:'Noa',seq:1},fx);
 assert.equal(s.receipts[0].seq,20);
 applyChatIncomingEvent({type:'chat.message',message:msg(8)},fx);
 assert.deepEqual(s.read,[8]);
 assert.equal(s.flags.at(-1)[0],'confirmed');
 assert.equal(s.messages.length,3);
});
test('rejected edit error is not cleared immediately by the same update',()=>{
 const {s,fx}=state();
 fx.onUpdated=()=>true;
 applyChatIncomingEvent({type:'chat.updated',message:{...msg(2),text:'mismatch'}},fx);
 assert.equal(s.flags.includes('clear-error'),false);
 fx.onUpdated=()=>false;
 applyChatIncomingEvent({type:'chat.updated',message:{...msg(2),text:'ok'}},fx);
 assert.equal(s.flags.includes('clear-error'),true);
});
test('revoked and error events route independently',()=>{
 const {s,fx}=state();
 applyChatIncomingEvent({type:'chat.revoked',error:'bye'},fx);
 applyChatIncomingEvent({type:'chat.error',error:'offline'},fx);
 assert.deepEqual(s.flags,['revoked',['error','offline']]);
});
