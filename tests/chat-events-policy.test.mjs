import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileChatReadReceipt,removeChatReactionsForMessage} from '../packages/shared/src/chat-events.ts';

test('read receipts keep the largest acknowledged sequence, never regress',()=>{
 const before=[
  {actorId:'member:fer',displayName:'Fer',seq:81},
  {actorId:'member:noa',displayName:'Noa',seq:120},
 ];
 const stale=reconcileChatReadReceipt(before,{actorId:'member:noa',displayName:'Noa',seq:50});
 assert.deepEqual(stale,[
  {actorId:'member:fer',displayName:'Fer',seq:81},
  {actorId:'member:noa',displayName:'Noa',seq:120},
 ]);
 const recent=reconcileChatReadReceipt(stale,{actorId:'member:noa',displayName:'Noa',seq:128});
 assert.equal(recent.find(x=>x.actorId==='member:noa').seq,128);
 assert.equal(recent.filter(x=>x.actorId==='member:noa').length,1);
 assert.deepEqual(before[1],{actorId:'member:noa',displayName:'Noa',seq:120},'do not mutate existing receipts');
 const added=reconcileChatReadReceipt(before,{actorId:'member:andy',displayName:'Andy',seq:3});
 assert.equal(added.length,3);
 assert.deepEqual(added[2],{actorId:'member:andy',displayName:'Andy',seq:3});
});

test('deleted message reactions disappear; unrelated message reactions remain',()=>{
 const existing=[
  {messageSeq:1,actorId:'member:fer',emoji:'👍'},
  {messageSeq:2,actorId:'member:noa',emoji:'❤️'},
  {messageSeq:1,actorId:'member:andy',emoji:'😂'},
 ];
 const next=removeChatReactionsForMessage(existing,1);
 assert.deepEqual(next,[existing[1]]);
 assert.equal(existing.length,3,'pure projection never mutates original reactions');
 assert.deepEqual(removeChatReactionsForMessage([],17),[]);
});

test('PWA and native Chat event handlers call only the canonical projections',()=>{
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/App.tsx']){
  const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(src,/reconcileChatReadReceipt\(before,(value|item)\)/);
  assert.match(src,/removeChatReactionsForMessage\(before,(value|item)\.message\.seq\)/);
  assert.match(src,/removeChatReactionsForMessage\(before,(value|item)\.seq\)/);
  assert.doesNotMatch(src,/setReceipts\(before=>\s*\[\.\.\.before\.filter/);
  assert.doesNotMatch(src,/setReactions\(before=>before\.filter\(r=>r\.messageSeq!==/);
 }
 const index=readFileSync(new URL('../packages/shared/src/index.ts',import.meta.url),'utf8');
 assert.match(index,/export \{reconcileChatReadReceipt,removeChatReactionsForMessage\} from '\.\/chat-events'/);
});
