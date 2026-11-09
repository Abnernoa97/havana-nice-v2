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
