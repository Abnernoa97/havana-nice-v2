import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileChatReadReceipt,removeChatReactionsForMessage,withoutRemovedChatMessages} from '../packages/shared/src/chat-events.ts';

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

test('deleted messages cannot return through stale pages or socket reconciliation',()=>{
 const rows=[{seq:8,text:'A'},{seq:9,text:'B'},{seq:10,text:'C',deletedAt:'2026-11-08T00:00:00Z'}];
 assert.deepEqual(withoutRemovedChatMessages(rows,new Set([9])),[rows[0]]);
 assert.equal(rows.length,3,'input remains untouched');
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
  const src=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(src,/removedSeq\.current\.add\((value|item)\.seq\)/,path);
  assert.match(src,/withoutRemovedChatMessages\(history,removedSeq\.current\)/,path);
  assert.match(src,/withoutRemovedChatMessages\(data\.messages,removedSeq\.current\)/,path);
  assert.doesNotMatch(src,/searchChatMessages|searchHistory|runSearch|setSearchResults|setResults\(/,path);
  assert.match(src,/activeSession\.current\?\.token/,path);
 }
 const android=readFileSync(new URL('../apps/android/app/NativeApp.tsx',import.meta.url),'utf8');
 assert.match(android,/reconcileChatMessages\(before,withoutRemovedChatMessages\(data\.messages,removedSeq\.current\)\)/);
});
test('PWA and native Chat event handlers call only the canonical projections',()=>{
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
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
