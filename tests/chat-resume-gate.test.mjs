import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ChatResumeGate} from '../packages/shared/src/chat-resume-gate.ts';

test('a newer foreground validation wins even with the same session token',()=>{
 const gate=new ChatResumeGate();
 const old=gate.begin(),latest=gate.begin();
 assert.equal(gate.isCurrent(old,'token','token',true),false);
 assert.equal(gate.isCurrent(latest,'token','token',true),true);
});
test('a background or offline transition invalidates earlier server replies',()=>{
 const gate=new ChatResumeGate(),request=gate.begin();
 gate.invalidate();
 assert.equal(gate.isCurrent(request,'token','token',true),false);
 assert.equal(gate.isCurrent(gate.begin(),'token','token',false),false);
});
test('a changed member token and a revoked session always reject stale replies',()=>{
 const gate=new ChatResumeGate(),request=gate.begin();
 assert.equal(gate.isCurrent(request,'member:old','member:new',true),false);
 assert.equal(gate.isCurrent(request,'member:old',undefined,true),false);
 assert.equal(gate.isCurrent(request,'member:old','member:old',true),true);
 gate.invalidate();
 assert.equal(gate.isRequestCurrent(request),false);
});
test('both platforms guard success, failure, startup restoration and logout',()=>{
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(source,/resumeGate=useRef\(new ChatResumeGate\(\)\)/);
  assert.match(source,/startupGate=useRef\(new ChatResumeGate\(\)\)/);
  assert.match(source,/const request=resumeGate\.current\.begin\(\)/);
  assert.match(source,/const validResponse=\(\)=>resumeGate\.current\.isCurrent\(/);
  assert.match(source,/if\(!validResponse\(\)\)return/);
  assert.match(source,/if\(validResponse\(\)\)connectLatest\.current\(/);
  assert.match(source,/const restoration=startupGate\.current\.begin\(\)/);
  assert.match(source,/!startupGate\.current\.isRequestCurrent\(restoration\)/);
  assert.match(source,/resumeGate\.current\.invalidate\(\)/);
 }
});

test('initial recovery is not invalidated by an unrelated foreground check',()=>{
 const startup=new ChatResumeGate(),resume=new ChatResumeGate();
 const initial=startup.begin();
 const foreground=resume.begin();
 resume.invalidate();
 assert.equal(startup.isRequestCurrent(initial),true);
 assert.equal(resume.isRequestCurrent(foreground),false);
 startup.invalidate();
 assert.equal(startup.isRequestCurrent(initial),false);
});
test('restoration waits until the platform is foreground before opening a socket',()=>{
 const pwa=readFileSync(new URL('../apps/pwa/src/app/App.tsx',import.meta.url),'utf8');
 const native=readFileSync(new URL('../apps/android/app/NativeApp.tsx',import.meta.url),'utf8');
 assert.match(pwa,/if\(document\.visibilityState==='visible'&&navigator\.onLine\)\s*connectLatest\.current\(approved\)/);
 assert.match(native,/if\(appLifecycle\.current==='active'\)connectLatest\.current\(approved\)/);
});
