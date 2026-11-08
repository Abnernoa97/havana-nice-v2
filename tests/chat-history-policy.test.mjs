import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ChatHistoryRequestGate,oldestConfirmedChatSeq,mergeOlderChatReactions} from '../packages/shared/src/chat-history.ts';

test('oldest message ignores pending and invalid sequence ids',()=>{
 assert.equal(oldestConfirmedChatSeq([]),null);
 assert.equal(oldestConfirmedChatSeq([{seq:0},{seq:-3}]),null);
 assert.equal(oldestConfirmedChatSeq([{seq:88},{seq:17},{seq:0},{seq:250}]),17);
});

test('reactions retain unique identities and never resurrect deleted bubbles',()=>{
 const old=[{messageSeq:10,actorId:'member:noa',emoji:'👍'},
  {messageSeq:11,actorId:'member:fer',emoji:'❤️'}];
 const incoming=[{messageSeq:10,actorId:'member:noa',emoji:'👍'},
  {messageSeq:10,actorId:'member:andy',emoji:'😂'},
  {messageSeq:11,actorId:'member:andy',emoji:'👍'},
  {messageSeq:10,actorId:'member:andy',emoji:'😂'}];
 const merged=mergeOlderChatReactions(old,incoming,new Set([11]));
 assert.deepEqual(merged,[incoming[1],old[0]]);
 assert.equal(old.length,2);
 assert.equal(incoming.length,4);
});

test('one in-flight older page and only latest search may update visible chat',()=>{
 const gate=new ChatHistoryRequestGate();
 const first=gate.beginOlder();
 assert.equal(first,1);
 assert.equal(gate.beginOlder(),null,'block double click before React loading state renders');
 assert.equal(gate.isOlderCurrent(first),true);
 assert.equal(gate.finishOlder(first),true);
 assert.equal(gate.beginOlder(),2);
 const a=gate.beginSearch();
 const b=gate.beginSearch();
 assert.equal(gate.isSearchCurrent(a),false);
 assert.equal(gate.isSearchCurrent(b),true);
 gate.cancelSearch();
 assert.equal(gate.isSearchCurrent(b),false);
 const oldSnapshot=gate.beginSnapshot();
 const newSnapshot=gate.beginSnapshot();
 assert.equal(gate.isSnapshotCurrent(oldSnapshot),false,'ignore slower first snapshot');
 assert.equal(gate.isSnapshotCurrent(newSnapshot),true);
 gate.reset();
 assert.equal(gate.isSnapshotCurrent(newSnapshot),false,'logout invalidates snapshot');
 assert.equal(gate.isOlderCurrent(2),false);
 assert.equal(gate.finishOlder(2),false);
 assert.ok(gate.beginOlder()>2,'new session starts clean');
});

test('PWA and Android history operations share one request gate and preserve their own session owner',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
  const app=read(path);
  assert.match(app,/historyRequests=useRef\(new ChatHistoryRequestGate\(\)\)/,path);
  assert.match(app,/oldestConfirmedChatSeq\(messages\)/,path);
  assert.match(app,/historyRequests\.current\.beginOlder\(\)/,path);
  assert.match(app,/historyRequests\.current\.isOlderCurrent\(request\)/,path);
  assert.match(app,/historyRequests\.current\.finishOlder\(request\)/,path);
  assert.match(app,/mergeOlderChatReactions\(/,path);
  assert.match(app,/historyRequests\.current\.beginSearch\(\)/,path);
  assert.match(app,/historyRequests\.current\.isSearchCurrent\(request\)/,path);
  assert.match(app,/historyRequests\.current\.beginSnapshot\(\)/,path);
  assert.match(app,/historyRequests\.current\.isSnapshotCurrent\(request\)/,path);
  assert.match(app,/activeSession\.current\?\.token===session\.token/,path);
  assert.match(app,/historyRequests\.current\.reset\(\)/,path);
  assert.match(app,/socket\.current=ws|socket\.current = ws/,path);
 }
 const exports=read('packages/shared/src/index.ts');
 assert.match(exports,/export \{ChatHistoryRequestGate,oldestConfirmedChatSeq,mergeOlderChatReactions\} from '\.\/chat-history'/);
 const shared=read('packages/shared/src/chat-history.ts');
 assert.doesNotMatch(shared,/new WebSocket|fetch\(|localStorage|AsyncStorage|useState|useEffect/);
});
