import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Familia member and Admin retain initial load and ignore obsolete async responses',()=>{
 const hook=read('apps/pwa/src/services/use-family-live.ts');
 assert.match(hook,/latest\.current\(\);[\s\S]*connect\(\)/);
 for(const [path,gate] of [
  ['apps/pwa/src/features/family/MemberFamily.tsx','seq'],
  ['apps/pwa/src/features/family/AdminFamily.tsx','requestId']
 ]){
  const src=read(path);
  assert.match(src,/void refresh\(\);[\s\S]*return\(\)=>\{\+\+\w+\.current;\};/);
  assert.match(src,new RegExp('\\+\\+'+gate+'\\.current'));
  assert.match(src,/useFamilyLive\(token,(?:true|false),\(\)=>\{/);
  assert.doesNotMatch(src,/addEventListener\('visibilitychange'|addEventListener\('online'/);
  assert.doesNotMatch(src,/removeEventListener\('visibilitychange'|removeEventListener\('online'/);
 }
});
test('Family realtime owns one visible/online synchronization per lifecycle event',()=>{
 const transpiled=ts.transpileModule(read('apps/pwa/src/services/use-family-live.ts'),{
  fileName:'use-family-live.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const listeners=new Map(),windowListeners=new Map();
 const document={hidden:false,
  addEventListener:(name,fn)=>listeners.set(name,fn),
  removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}
 };
 const window={addEventListener:(name,fn)=>windowListeners.set(name,fn),
  removeEventListener:(name,fn)=>{if(windowListeners.get(name)===fn)windowListeners.delete(name);}
 };
 const navigator={onLine:true};
 class Socket{
  static OPEN=1;static CONNECTING=0;static CLOSED=3;
  readyState=Socket.CONNECTING;
  close(){this.readyState=Socket.CLOSED;}
 }
 let created=0,refreshes=0,cleanup;
 const clock=new Map();let nextId=0;
 const module={exports:{}};
 runInNewContext(transpiled,{
  module,exports:module.exports,window,document,navigator,WebSocket:Socket,
  setTimeout(fn,delay){const id=++nextId;clock.set(id,{fn,delay});return id;},
  clearTimeout(id){clock.delete(id);},
  require(name){
   if(name==='react')return {
    useRef:value=>({current:value}),
    useEffect:fn=>{cleanup=fn();},
   };
   assert.equal(name,'@havana/shared');
   return {FAMILY_WS_HANDSHAKE_TIMEOUT_MS:9000,openFamilyRealtime(){
    created++;return new Socket();
   }};
  },
 });
 module.exports.useFamilyLive('token-authorization',false,()=>refreshes++);
 assert.equal(created,1,'one socket on mount');
 assert.equal(listeners.size,1);
 assert.equal(windowListeners.size,2);
 listeners.get('visibilitychange')();
 assert.equal(refreshes,1,'one refresh when foregrounded');
 windowListeners.get('online')();
 assert.equal(refreshes,2,'one refresh per online signal');
 navigator.onLine=false;
 windowListeners.get('offline')();
 assert.equal(refreshes,2,'offline does not fetch private media');
 navigator.onLine=true;
 windowListeners.get('online')();
 assert.equal(refreshes,3);
 assert.equal(created,2,'one new socket after offline close');
 cleanup();
 assert.equal(listeners.size,0);
 assert.equal(windowListeners.size,0);
 assert.equal(clock.size,0,'no retry/watchdog survives unmount');
});
