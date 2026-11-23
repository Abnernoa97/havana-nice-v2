import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const compiled=ts.transpileModule(read('packages/shared/src/chat-outbox.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const exports={};
runInNewContext(compiled,{exports});
const {createQueuedChatMessage}=exports;
test('new offline message keeps the exact stable schema and never leaks a session token',()=>{
 const session={actorId:'fer',displayName:'Fer',token:'private-value',expiresAt:'2030-01-01'};
 const message=createQueuedChatMessage(session,'Listo',42,'client-123','2026-11-23T20:00:00.000Z');
 assert.equal(JSON.stringify(message),JSON.stringify({
  seq:0,clientMessageId:'client-123',senderId:'fer',senderName:'Fer',
  text:'Listo',sentAt:'2026-11-23T20:00:00.000Z',pending:true,
  deliveryStatus:'queued',replyToSeq:42,
 }));
 assert.doesNotMatch(JSON.stringify(message),/private-value/);
});
test('no-reply messages remain null and independent of recipient or device',()=>{
 const session={actorId:'noa',displayName:'Noa'};
 const message=createQueuedChatMessage(session,'Hola',null,'id','now');
 assert.equal(message.replyToSeq,null);
 assert.equal(message.deliveryStatus,'queued');
 assert.equal(message.senderId,'noa');
});
test('both Chat owners use the exact same outgoing message factory',()=>{
 const pwa=read('apps/pwa/src/features/chat/usePwaChatController.ts');
 const native=read('apps/android/features/chat/useNativeChatController.ts');
 const index=read('packages/shared/src/index.ts');
 for(const owner of [pwa,native]){
  assert.match(owner,/const (message|item)=createQueuedChatMessage\(/);
  assert.match(owner,/session,text,replyTo\?\.seq\|\|null,clientMessageId,new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(owner,/seq:\s*0,\s*clientMessageId,\s*senderId:\s*session\.actorId/);
 }
 assert.match(index,/export \{createQueuedChatMessage,/);
});
