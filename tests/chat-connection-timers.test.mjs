import test from 'node:test';
import assert from 'node:assert/strict';
import {ChatConnectionTimers} from '../packages/shared/src/chat-connection-timers.ts';

function fakeClock(){
 const jobs=new Map();let next=0;
 return {
  jobs,
  clock:{
   schedule(callback,delay){const id=++next;jobs.set(id,{callback,delay});return id;},
   cancel(handle){jobs.delete(handle);}
  },
  fireOne(){const [id,job]=jobs.entries().next().value;jobs.delete(id);job.callback();},
 };
}
test('one retry timer per owner, correct 1s to 20s backoff',()=>{
 const clock=fakeClock(),timers=new ChatConnectionTimers(clock.clock);
 let attempts=0;
 assert.equal(timers.scheduleRetry(1,()=>attempts++),true);
 assert.equal(timers.scheduleRetry(2,()=>attempts+=100),false);
 assert.equal(timers.retryPending,true);
 assert.deepEqual([...clock.jobs.values()].map(x=>x.delay),[1000]);
 clock.fireOne();
 assert.equal(attempts,1);
 assert.equal(timers.retryPending,false);
 assert.equal(timers.scheduleRetry(6,()=>attempts++),true);
 assert.deepEqual([...clock.jobs.values()].map(x=>x.delay),[20000]);
 timers.clearRetry();
 assert.equal(clock.jobs.size,0);
});
test('only the most recent handshake can time out',()=>{
 const clock=fakeClock(),timers=new ChatConnectionTimers(clock.clock);
 let stalled=0;
 timers.watchHandshake(()=>true,()=>stalled+=100);
 timers.watchHandshake(()=>false,()=>stalled+=100);
 assert.equal(clock.jobs.size,1);
 assert.deepEqual([...clock.jobs.values()].map(x=>x.delay),[9000]);
 clock.fireOne();
 assert.equal(stalled,0);
 timers.watchHandshake(()=>true,()=>stalled++);
 clock.fireOne();
 assert.equal(stalled,1);
});
test('clearing both timers prevents stale retries on app background/unmount',()=>{
 const clock=fakeClock(),timers=new ChatConnectionTimers(clock.clock);
 let called=0;
 timers.scheduleRetry(1,()=>called++);
 timers.watchHandshake(()=>true,()=>called++);
 assert.equal(clock.jobs.size,2);
 timers.clearAll();
 assert.equal(clock.jobs.size,0);
 assert.equal(timers.retryPending,false);
 assert.equal(called,0);
});

test('callbacks already queued before cancel cannot resurrect a previous socket',()=>{
 const jobs=new Map();let id=0;
 const clock={
  schedule(callback,delay){const key=++id;jobs.set(key,{callback,delay});return key;},
  cancel(key){/* emulate a callback that was already delivered to the event queue */},
 };
 const controller=new ChatConnectionTimers(clock);
 let retried=0,stalled=0;
 controller.scheduleRetry(1,()=>retried++);
 controller.watchHandshake(()=>true,()=>stalled++);
 const obsolete=[...jobs.values()].map(job=>job.callback);
 controller.clearAll();
 for(const callback of obsolete)callback();
 assert.equal(retried,0);
 assert.equal(stalled,0);
 controller.scheduleRetry(1,()=>retried++);
 controller.watchHandshake(()=>true,()=>stalled++);
 const current=[...jobs.values()].slice(2).map(job=>job.callback);
 for(const callback of current)callback();
 assert.equal(retried,1);
 assert.equal(stalled,1);
});
