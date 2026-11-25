import {readNativeSource} from './helpers/native-source.mjs';
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
 const android=readFileSync(new URL('../apps/android/features/chat/NativeChatTimeline.tsx',import.meta.url),'utf8');
 for(const code of [pwa,android]){
  assert.match(code,/useMemo\(\(\)=>buildChatDisplayIndex\(messages,reactions,receipts,/);
  assert.match(code,/display\.replySnippets\.get\(message\.replyToSeq\)/);
  assert.match(code,/display\.reactionBadges\.get\(message\.seq\)/);
  assert.match(code,/badges\.map\(\(\{emoji,count\}\)/);
  assert.match(code,/display\.deliveryFor\(message\)/);
  assert.doesNotMatch(code,/✓✓|hn-chat-ticks|deliveryTicks/);
  assert.doesNotMatch(code,/messages\.find\(m=>m\.seq===message\.replyToSeq\)/);
  assert.doesNotMatch(code,/reactions\.filter\(r=>r\.messageSeq===message\.seq/);
 }
 const controller=readNativeSource(import.meta.url);
 assert.match(controller,/import NativeChatTimeline from '\.\/NativeChatTimeline'/);
 assert.match(controller,/<NativeChatTimeline[\s\S]*onScrollBeginDrag=\{onTimelineScrollBeginDrag\}/);
 assert.doesNotMatch(controller,/<SwipeableBubble|<NativeChatMediaView|buildChatDisplayIndex\(/);
 const index=readFileSync(new URL('../packages/shared/src/index.ts',import.meta.url),'utf8');
 assert.match(index,/export \{buildChatDisplayIndex\} from '\.\/chat-display'/);
});

test('Exact named readers exclude self, duplicates and watermarks below the message',()=>{
 const receipts=[{actorId:'member:fer',displayName:'Fer',seq:100},{actorId:'member:noa',displayName:'Noa',seq:5},
 {actorId:'member:noa',displayName:'Noa',seq:9},{actorId:'member:andy',displayName:'Andy',seq:8},
 {actorId:'member:orly',displayName:'Orly',seq:2}];
 const index=buildChatDisplayIndex([],[],receipts,'member:fer');
 const own={...row(8,'Hola'),senderId:'member:fer'};
 assert.equal(index.deliveryFor(own).label,'Leído por 2');
 assert.deepEqual(index.deliveryFor(own).readers.map(r=>r.displayName),['Noa','Andy']);
 assert.equal(index.deliveryFor({...own,seq:10}).label,'Enviado');
 assert.equal(index.deliveryFor({...own,pending:true,seq:0,deliveryStatus:'sending'}).label,'Enviando…');
 assert.equal(index.deliveryFor({...own,pending:true,seq:0,deliveryStatus:'error'}).label,'No enviado');
 assert.equal(index.deliveryFor({...own,pending:true,seq:0}).label,'En cola');
 assert.equal(index.deliveryFor({...own,deletedAt:'2026-11-25'}).readers.length,0);
 assert.equal(index.deliveryFor(row(8,'other')).readers.length,0);
});
test('Read events originate from visible timelines, not received history or background modules',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const android=read('apps/android/features/chat/NativeChatTimeline.tsx');
 const pwa=read('apps/pwa/src/features/chat/ChatTimeline.tsx');
 assert.match(android,/onViewableItemsChanged=\{onViewableItemsChanged\}/);
 assert.match(android,/itemVisiblePercentThreshold:50,minimumViewTime:250/);
 assert.match(pwa,/new IntersectionObserver/);
 assert.match(pwa,/entry\.intersectionRatio>=\.5/);
 assert.match(pwa,/if\(disposed\|\|document\.visibilityState!=='visible'\)return/);
 for(const p of ['apps/android/features/chat/useNativeChatController.ts','apps/pwa/src/features/chat/usePwaChatController.ts']){
  const c=read(p);
  assert.match(c,/if\(activeScreen!=='chat'\|\|readScreen\.current!=='chat'\|\|!session\|\|activeSession\.current\?\.token!==session\.token/);
  assert.match(c,/onMessageReceived:\(\)=>\{flushOutbox\(\);\}/);
  assert.doesNotMatch(c,/sendReadReceipt\(/);
  assert.match(c,/lastReadSent\.current\?\.socket===ws/);
 }
});
