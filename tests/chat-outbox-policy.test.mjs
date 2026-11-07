import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 selectNextQueuedChatMessage,setOutgoingChatStatus,
 projectOutgoingChatStatus,CHAT_ACK_TIMEOUT_MS
} from '../packages/shared/src/chat-outbox.ts';

const row=(id,time,status='queued',pending=true,senderId='member:fer')=>({
 seq:pending?-1:1,clientMessageId:id,senderId,senderName:'Fer',
 text:id,sentAt:new Date(time).toISOString(),pending,deliveryStatus:status
});

test('both clients send in creation order even when Map insertion is unsorted',()=>{
 const older=row('older',1000),newer=row('newer',2000);
 const map=new Map([['newer',newer],['older',older]]);
 assert.equal(selectNextQueuedChatMessage(map.values()),older);
 assert.equal(map.keys().next().value,'newer','selection may not mutate the original Map');
 assert.equal(CHAT_ACK_TIMEOUT_MS,12000);
 assert.equal(selectNextQueuedChatMessage([]),null);
});

test('in-flight server ACK blocks new sends; explicit retry keeps failed original first',()=>{
 const queued=row('first',1000),sending=row('inflight',2000,'sending');
 assert.equal(selectNextQueuedChatMessage([queued,sending]),null);
 assert.equal(selectNextQueuedChatMessage([row('failed',1000,'error'),queued]),null);
 assert.equal(selectNextQueuedChatMessage([row('already',1000,'sent'),queued]),null);
 const unknown=row('unknown',1000);delete unknown.deliveryStatus;
 assert.equal(selectNextQueuedChatMessage([unknown,queued]),null);
});

test('same optimistic state transition updates only pending bubbles from same sender',()=>{
 const original=row('id',1000);
 const duplicateSender=row('id',1000,'queued',true,'member:noa');
 const confirmed=row('id',1000,'sent',false);
 const other=row('other',900);
 const map=new Map([['id',original]]);
 const previous=setOutgoingChatStatus(map,'id','error');
 assert.equal(previous,original);
 assert.equal(map.get('id').deliveryStatus,'error');
 assert.equal(map.get('id').failed,true);
 const result=projectOutgoingChatStatus([original,duplicateSender,confirmed,other],previous,'error');
 assert.equal(result[0].failed,true);
 assert.equal(result[0].deliveryStatus,'error');
 assert.equal(result[1],duplicateSender,'other sender must not change');
 assert.equal(result[2],confirmed,'server-confirmed copy must not change');
 assert.equal(result[3],other,'other client message ID must not change');
 assert.equal(setOutgoingChatStatus(map,'id','queued').deliveryStatus,'error');
 assert.equal(map.get('id').failed,false);
 assert.equal(map.get('id').deliveryStatus,'queued');
 assert.equal(setOutgoingChatStatus(map,'missing','queued'),null);
 assert.equal(map.size,1,'no phantom outgoing message created');
});

test('one shared outbox and timeout implementation, no parallel client sort/ACK logic',()=>{
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/App.tsx']){
  const s=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(s,/selectNextQueuedChatMessage\(outbox\.current\.values\(\)\)/,path);
  assert.match(s,/setOutgoingChatStatus\(outbox\.current,id,state\)/,path);
  assert.match(s,/projectOutgoingChatStatus\(before,original,state\)/,path);
  assert.match(s,/CHAT_ACK_TIMEOUT_MS/,path);
  assert.doesNotMatch(s,/\[\.\.\.outbox\.current\.values\(\)\]\.sort/,path);
  assert.doesNotMatch(s,/\}, 12000\)\)/,path);
 }
 const index=readFileSync(new URL('../packages/shared/src/index.ts',import.meta.url),'utf8');
 assert.match(index,/selectNextQueuedChatMessage,setOutgoingChatStatus,projectOutgoingChatStatus,CHAT_ACK_TIMEOUT_MS/);
});
