import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function compile(path,requireFn=()=>{throw Error('Unexpected import');}){
 const js=ts.transpileModule(read(path),{compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
 }}).outputText;
 const exports={};runInNewContext(js,{exports,require:requireFn});return exports;
}
const gates=compile('packages/shared/src/chat-history.ts');
const requests=compile('packages/shared/src/chat-history-requests.ts',name=>{
 assert.equal(name,'./chat-history');return gates;
});
const {ChatHistoryRequestGate}=gates;
const {requestOlderChatPage,requestChatSnapshot}=requests;
const session={token:'A',actorId:'fer',displayName:'Fer'};
const page=seq=>({messages:[{seq}],reactions:[],receipts:[],hasMore:false});
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('older request fetches oldest confirmed seq and releases gate on completion',async()=>{
 const gate=new ChatHistoryRequestGate(),events=[];let seq;
 const done=await requestOlderChatPage({
  session,messages:[{seq:48},{seq:0},{seq:12}],gate,isCurrent:()=>true,
  fetchPage:async(_,oldest)=>{seq=oldest;return page(11);},
  onStart:()=>events.push('start'),onPage:data=>events.push(data.messages[0].seq),
  onError:()=>events.push('error'),onFinish:()=>events.push('finish'),
 });
 assert.equal(done,true);assert.equal(seq,12);
 assert.equal(events.join(','),'start,11,finish');
 assert.notEqual(gate.beginOlder(),null);
});
test('duplicate page rejected; logout discards delayed response',async()=>{
 const gate=new ChatHistoryRequestGate(),future=deferred(),events=[];let current='A',fetches=0;
 const options={
  session,messages:[{seq:19}],gate,isCurrent:()=>current===session.token,
  fetchPage:()=>{fetches++;return future.promise;},
  onStart:()=>events.push('start'),onPage:()=>events.push('page'),
  onError:()=>events.push('error'),onFinish:()=>events.push('finish'),
 };
 const first=requestOlderChatPage(options);
 assert.equal(await requestOlderChatPage(options),false);assert.equal(fetches,1);
 gate.reset();current='B';future.resolve(page(2));
 assert.equal(await first,false);assert.equal(events.join(','),'start');
});
test('network error calls error handler and unlocks page loading',async()=>{
 const gate=new ChatHistoryRequestGate(),events=[];
 const result=await requestOlderChatPage({
  session,messages:[{seq:8}],gate,isCurrent:()=>true,
  fetchPage:async()=>{throw Error('offline');},
  onStart:()=>events.push('start'),onPage:()=>events.push('page'),
  onError:e=>events.push(e.message),onFinish:()=>events.push('finish'),
 });
 assert.equal(result,false);assert.equal(events.join(','),'start,offline,finish');
});
test('newest snapshot wins; stale failures cannot change session',async()=>{
 const gate=new ChatHistoryRequestGate(),first=deferred(),second=deferred(),changes=[];
 const request=promise=>requestChatSnapshot({
  session,gate,isCurrent:()=>true,fetchSnapshot:()=>promise,
  onPage:data=>changes.push(data.messages[0].seq),onError:()=>changes.push('error'),
 });
 const older=request(first.promise),newer=request(second.promise);
 first.resolve(page(1));second.resolve(page(2));
 await Promise.all([older,newer]);assert.equal(changes.join(','),'2');
 const pending=deferred(),stale=request(pending.promise);
 gate.reset();pending.reject(Error('old error'));
 await stale;assert.equal(changes.join(','),'2');
});
test('both controllers share request lifecycle but retain independent sockets and scroll policies',()=>{
 const android=read('apps/android/features/chat/useNativeChatController.ts');
 const web=read('apps/pwa/src/features/chat/usePwaChatController.ts');
 const index=read('packages/shared/src/index.ts'),source=read('packages/shared/src/chat-history-requests.ts');
 for(const owner of [android,web]){
  assert.match(owner,/requestOlderChatPage\(\{/);
  assert.match(owner,/requestChatSnapshot\(\{/);
  assert.match(owner,/gate:historyRequests\.current/);
  assert.match(owner,/historyRequests\.current\.reset\(\)/);
  assert.match(owner,/socket\.current = ws|socket\.current=ws/);
 }
 assert.match(android,/autoScroll\.current=false/);
 assert.match(web,/scrollOlderOnce\.current=true/);
 assert.match(source,/gate\.finishOlder\(request\)/);
 assert.match(index,/export \{requestOlderChatPage,requestChatSnapshot\} from '\.\/chat-history-requests'/);
 assert.doesNotMatch(source,/WebSocket|localStorage|AsyncStorage|useState|useEffect/);
});
