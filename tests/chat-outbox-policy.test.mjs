import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 selectNextQueuedChatMessage,setOutgoingChatStatus,
 projectOutgoingChatStatus,CHAT_ACK_TIMEOUT_MS
} from '../packages/shared/src/chat-outbox.ts';
import * as delivery from '../packages/shared/src/chat-outbox-delivery.ts';

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

test('shared send and ACK lifecycle is the only source of timer/transport logic',()=>{
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(source,/flushChatOutbox\(socket\.current,outbox\.current,(ackTimers|acknowledgementTimers)\.current,markOutgoing\)/);
  assert.match(source,/confirmChatOutgoingMessage\(message,activeSession\.current\?\.actorId/);
  assert.match(source,/pauseChatOutbox\(outbox\.current,(ackTimers|acknowledgementTimers)\.current,markOutgoing\)/);
  assert.match(source,/setOutgoingChatStatus\(outbox\.current,id,state\)/);
  assert.match(source,/projectOutgoingChatStatus\(before,original,state\)/);
  assert.doesNotMatch(source,/selectNextQueuedChatMessage\(outbox\.current\.values\(\)\)/);
  assert.doesNotMatch(source,/(ackTimers|acknowledgementTimers)\.current\.set\(/);
 }
 const exports=readFileSync(new URL('../packages/shared/src/index.ts',import.meta.url),'utf8');
 assert.match(exports,/export \{clearChatAckTimer,pauseChatOutbox,confirmChatOutgoingMessage,flushChatOutbox\} from '\.\/chat-outbox-delivery'/);
});

test('one send at a time, confirmation by original actor, and one ACK timer',()=>{
 const tasks=new Map();let timerId=0;
 const clock={
  start(fn,ms){const id=++timerId;tasks.set(id,{fn,ms});return id;},
  clear(id){tasks.delete(id);}
 };
 const outbox=new Map([['a',row('a',1000)],['b',row('b',2000)]]);
 const timers=new Map(),sent=[];
 const mark=(id,status)=>{setOutgoingChatStatus(outbox,id,status);};
 const socket={readyState:1,send(payload){sent.push(JSON.parse(payload));}};
 assert.equal(delivery.flushChatOutbox(socket,outbox,timers,mark,clock),true);
 assert.deepEqual(sent,[{type:'chat.send',clientMessageId:'a',text:'a',replyToSeq:null}]);
 assert.equal(tasks.size,1);
 assert.equal([...tasks.values()][0].ms,CHAT_ACK_TIMEOUT_MS);
 assert.equal(delivery.flushChatOutbox(socket,outbox,timers,mark,clock),false);
 assert.equal(delivery.confirmChatOutgoingMessage({...row('a',1000),pending:false},'member:noa',outbox,timers,clock),false);
 assert.equal(outbox.size,2);
 assert.equal(delivery.confirmChatOutgoingMessage({...row('a',1000),pending:false},'member:fer',outbox,timers,clock),true);
 assert.equal(outbox.size,1);assert.equal(tasks.size,0);
 assert.equal(delivery.flushChatOutbox(socket,outbox,timers,mark,clock),true);
 assert.equal(sent[1].clientMessageId,'b');
});

test('timed-out sends only retry explicitly; pause and failed socket keep message IDs',()=>{
 const tasks=new Map();let timerId=0;
 const clock={
  start(fn,ms){const id=++timerId;tasks.set(id,fn);return id;},
  clear(id){tasks.delete(id);}
 };
 const outbox=new Map([['original',row('original',1000)]]);
 const timers=new Map(),states=[];
 const mark=(id,state)=>{states.push(state);setOutgoingChatStatus(outbox,id,state);};
 const socket={readyState:1,send(){}};
 assert.equal(delivery.flushChatOutbox({readyState:0,send(){}},outbox,timers,mark,clock),false);
 assert.equal(delivery.flushChatOutbox(socket,outbox,timers,mark,clock),true);
 tasks.get(timers.get('original'))();
 assert.equal(outbox.get('original').deliveryStatus,'error');
 assert.equal(delivery.flushChatOutbox(socket,outbox,timers,mark,clock),false);
 delivery.clearChatAckTimer(timers,'original',clock);
 mark('original','queued');
 assert.equal(delivery.flushChatOutbox(socket,outbox,timers,mark,clock),true);
 delivery.pauseChatOutbox(outbox,timers,mark,clock);
 assert.equal(outbox.get('original').clientMessageId,'original');
 assert.equal(outbox.get('original').deliveryStatus,'queued');
 assert.equal(tasks.size,0);assert.equal(timers.size,0);
 assert.equal(delivery.flushChatOutbox({readyState:1,send(){throw Error('offline');}},outbox,timers,mark,clock),false);
 assert.equal(outbox.get('original').deliveryStatus,'error');
 assert.equal(timers.size,0);
});
