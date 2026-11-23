import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkChatEditDecision,chatEditPayload,chatDeletePayload,CHAT_EDIT_ACK_TIMEOUT_MS} from '../packages/shared/src/chat-message-mutations.ts';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=Date.parse('2026-11-23T20:00:00.000Z');
const editing={seq:101,text:'Original',sentAt:new Date(now-60_000).toISOString()};
test('edit pending, empty and unchanged decisions preserve their order',()=>{
 assert.equal(checkChatEditDecision(editing,'Nuevo',true,now),'pending');
 assert.equal(checkChatEditDecision(editing,'',false,now),'empty');
 assert.equal(checkChatEditDecision(editing,'Original',false,now),'unchanged');
 assert.equal(checkChatEditDecision(editing,'Nuevo',false,now),'ready');
});
test('15-minute cutoff preserves identical boundary behavior',()=>{
 const within={...editing,sentAt:new Date(now-899_999).toISOString()};
 const atLimit={...editing,sentAt:new Date(now-900_000).toISOString()};
 assert.equal(checkChatEditDecision(within,'Actualizado',false,now),'ready');
 assert.equal(checkChatEditDecision(atLimit,'Actualizado',false,now),'expired');
 assert.equal(checkChatEditDecision(atLimit,'Original',false,now),'unchanged');
});
test('wire protocol and confirmation timeout are unchanged',()=>{
 assert.deepEqual(JSON.parse(chatEditPayload(101,'¿Listos?')),{type:'chat.edit',seq:101,text:'¿Listos?'});
 assert.deepEqual(JSON.parse(chatDeletePayload(101)),{type:'chat.delete',seq:101});
 assert.equal(CHAT_EDIT_ACK_TIMEOUT_MS,10000);
});
test('Android/PWA share one policy and never rebuild the outgoing mutation payload',()=>{
 const index=read('packages/shared/src/index.ts');
 for(const path of ['apps/pwa/src/features/chat/usePwaChatController.ts','apps/android/features/chat/useNativeChatController.ts']){
  const src=read(path);
  assert.match(src,/checkChatEditDecision\(editing,text,!!editPending\.current\)/);
  assert.match(src,/ws\.send\(chatEditPayload\(editing\.seq,text\)\)/);
  assert.match(src,/ws\.send\(chatDeletePayload\(message\.seq\)\)/);
  assert.match(src,/CHAT_EDIT_ACK_TIMEOUT_MS/);
  assert.doesNotMatch(src,/JSON\.stringify\(\{type:'chat\.edit'|JSON\.stringify\(\{type:'chat\.delete'/);
 }
 assert.match(index,/export \{checkChatEditDecision,chatEditPayload,chatDeletePayload,CHAT_EDIT_ACK_TIMEOUT_MS\}/);
});
