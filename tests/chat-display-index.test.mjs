import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildChatDisplayIndex} from '../packages/shared/src/chat-display.ts';

const row=(seq,text)=>({
 seq,clientMessageId:'id-'+seq,senderId:'member:noa',senderName:'Noa',
 text,sentAt:'2026-11-07T14:00:00Z',pending:false,
});

test('shared Chat display index preserves reply snippets, first match and Unicode boundaries',()=>{
 const messages=[row(3,'A'.repeat(85)),row(6,'Hola'),row(3,'Duplicated reply must not override first match')];
 const index=buildChatDisplayIndex(messages,[],[],'member:fer');
 assert.equal(index.replySnippets.get(3),'A'.repeat(70));
 assert.equal(index.replySnippets.get(6),'Hola');
 assert.equal(index.replySnippets.get(777),undefined);
 assert.equal(index.lastReadByOther,0);
 assert.equal(index.reactionBadges.size,0);
 assert.equal(messages[0].text.length,85,'original chat history must not be mutated');
});

test('shared Chat reaction badges preserve emoji order and exact counts',()=>{
 const reactions=[
 {messageSeq:5,actorId:'member:fer',emoji:'👍'},
 {messageSeq:5,actorId:'member:noa',emoji:'❤️'},
 {messageSeq:5,actorId:'member:andy',emoji:'👍'},
 {messageSeq:2,actorId:'member:noa',emoji:'😂'},
 {messageSeq:5,actorId:'member:orly',emoji:'😂'},
 ];
 const index=buildChatDisplayIndex([row(2,'One'),row(5,'Five')],reactions,[],'member:fer');
 assert.deepEqual(index.reactionBadges.get(5),[
  {emoji:'❤️',count:1},{emoji:'😂',count:1},{emoji:'👍',count:2}
 ]);
 assert.deepEqual(index.reactionBadges.get(2),[{emoji:'😂',count:1}]);
 assert.equal(index.reactionBadges.has(1),false);
 assert.equal(reactions.length,5);
});

test('other-member read receipts are monotonic; own receipts do not falsely mark own message read',()=>{
 const receipts=[
 {actorId:'member:fer',displayName:'Fer',seq:99},
 {actorId:'member:noa',displayName:'Noa',seq:3},
 {actorId:'member:andy',displayName:'Andy',seq:8},
 {actorId:'member:orly',displayName:'Orly',seq:1},
 ];
 const index=buildChatDisplayIndex([],[],receipts,'member:fer');
 assert.equal(index.lastReadByOther,8);
 assert.equal(buildChatDisplayIndex([],[],receipts,'member:noa').lastReadByOther,99);
 assert.equal(buildChatDisplayIndex([],[],[receipts[0]],'member:fer').lastReadByOther,0);
});

test('both platforms memoize the index instead of quadratic per-bubble scans',()=>{
 const pwa=readFileSync(new URL('../apps/pwa/src/features/chat/ChatTimeline.tsx',import.meta.url),'utf8');
 const android=readFileSync(new URL('../apps/android/App.tsx',import.meta.url),'utf8');
 for(const code of [pwa,android]){
  assert.match(code,/useMemo\(\(\)=>buildChatDisplayIndex\(messages,reactions,receipts,/);
  assert.match(code,/display\.replySnippets\.get\(message\.replyToSeq\)/);
  assert.match(code,/display\.reactionBadges\.get\(message\.seq\)/);
  assert.match(code,/badges\.map\(\(\{emoji,count\}\)/);
  assert.match(code,/display\.lastReadByOther>=message\.seq/);
  assert.doesNotMatch(code,/messages\.find\(m=>m\.seq===message\.replyToSeq\)/);
  assert.doesNotMatch(code,/reactions\.filter\(r=>r\.messageSeq===message\.seq/);
 }
 const index=readFileSync(new URL('../packages/shared/src/index.ts',import.meta.url),'utf8');
 assert.match(index,/export \{buildChatDisplayIndex\} from '\.\/chat-display'/);
});
