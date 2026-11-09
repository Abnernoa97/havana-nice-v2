import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 CHAT_MESSAGE_WINDOW_SIZE,CHAT_MESSAGE_WINDOW_STEP,
 selectChatMessageWindow,previousChatWindowEnd,nextChatWindowEnd,chatWindowKey,chatWindowEdgeAction,
} from '../apps/pwa/src/features/chat/chat-message-window.ts';

const message=(n)=>({
 seq:n,clientMessageId:'client-'+n,senderId:'member:test',
 senderName:'Test',text:'Mensaje '+n,sentAt:new Date(1_700_000_000_000+n*1000).toISOString(),
});

test('1,000 messages mount only the newest 120 and never discard the data',()=>{
 const all=Array.from({length:1000},(_,i)=>message(i+1));
 const view=selectChatMessageWindow(all,null);
 assert.equal(view.rows.length,CHAT_MESSAGE_WINDOW_SIZE);
 assert.equal(view.rows[0].seq,881);
 assert.equal(view.rows.at(-1).seq,1000);
 assert.equal(view.total,1000);
 assert.equal(all.length,1000);
 assert.equal(view.hasOlder,true);
 assert.equal(view.hasNewer,false);
});

test('Previous and next pages overlap, remain bounded and never skip message IDs',()=>{
 const all=Array.from({length:520},(_,i)=>message(i+1));
 let current=selectChatMessageWindow(all,null);
 const latestKey=chatWindowKey(current.rows[0]);
 const previousEnd=previousChatWindowEnd(current.start,current.end);
 const older=selectChatMessageWindow(all,chatWindowKey(all[previousEnd-1]));
 assert.equal(CHAT_MESSAGE_WINDOW_STEP,40);
 assert.equal(previousEnd,current.end-40);
 assert.equal(older.rows.length,120);
 assert.ok(older.rows.some(row=>chatWindowKey(row)===latestKey));
 assert.equal(older.hasNewer,true);
 assert.equal(older.hasOlder,true);
 const forwardEnd=nextChatWindowEnd(older.end,all.length);
 const forward=selectChatMessageWindow(all,forwardEnd===all.length?null:chatWindowKey(all[forwardEnd-1]));
 assert.deepEqual(forward.rows.map(row=>row.seq),current.rows.map(row=>row.seq));
});

test('Stable anchor survives new incoming messages and older server pagination',()=>{
 let all=Array.from({length:1000},(_,i)=>message(i+1));
 const initial=selectChatMessageWindow(all,chatWindowKey(all[659]));
 const first=initial.rows[0].seq;
 all=[...Array.from({length:35},(_,i)=>message(-35+i)),...all,message(1001),message(1002)];
 const after=selectChatMessageWindow(all,chatWindowKey(message(660)));
 assert.equal(after.rows[0].seq,first);
 assert.equal(after.rows.at(-1).seq,660);
 assert.equal(after.rows.length,120);
 assert.equal(after.hasNewer,true);
});

test('Deleted rows stay hidden, empty histories are safe and orphan anchors recover',()=>{
 const empty=selectChatMessageWindow([],null);
 assert.equal(empty.rows.length,0);
 assert.equal(empty.hasOlder,false);
 assert.equal(empty.hasNewer,false);
 const rows=Array.from({length:8},(_,i)=>({...message(i+1),deletedAt:i===2?'deleted':undefined}));
 const shown=selectChatMessageWindow(rows,null);
 assert.equal(shown.rows.length,7);
 assert.ok(!shown.rows.some(row=>row.seq===3));
 const afterDelete=selectChatMessageWindow(rows,'unknown-id');
 assert.deepEqual(afterDelete.rows,shown.rows);
});

test('Outgoing messages request the newest window even from an older page',()=>{
 const app=readFileSync(new URL('../apps/pwa/src/app/App.tsx',import.meta.url),'utf8');
 const timeline=readFileSync(new URL('../apps/pwa/src/features/chat/ChatTimeline.tsx',import.meta.url),'utf8');
 assert.match(app,/setLatestMessageRequest\(n=>n\+1\)/);
 assert.match(app,/<ChatTimeline messages=\{messages\} latestMessageRequest=\{latestMessageRequest\}/);
 assert.match(timeline,/setEndAnchorKey\(null\);\s*onReturnLatest\(\);\s*\},\[latestMessageRequest,onReturnLatest\]\)/);
});

test('Server pagination reveals the older page on the first request',()=>{
 const timeline=readFileSync(new URL('../apps/pwa/src/features/chat/ChatTimeline.tsx',import.meta.url),'utf8');
 assert.match(timeline,/else if\(hasMore\)\{/);
 assert.match(timeline,/const overlap=windowed\.rows\[Math\.min\(windowed\.rows\.length-1,59\)\]/);
 assert.match(timeline,/if\(overlap\)setEndAnchorKey\(chatWindowKey\(overlap\)\)/);
 assert.match(timeline,/onLoadOlder\(\)/);
});

test('Scrolling across loaded history windows is automatic only for real user gestures',()=>{
 const base={
   scrollHeight:10000,clientHeight:800,recentGesture:true,transitionBlocked:false,
   loadingOlder:false,hasOlder:true,hasNewer:true,readingHistory:true,
 };
 const check=(updates)=>chatWindowEdgeAction({...base,...updates});
 assert.equal(check({scrollTop:40,direction:-1}),'older');
 assert.equal(check({scrollTop:9145,direction:1}),'newer');
 assert.equal(check({scrollTop:9180,direction:1,hasNewer:false}),'latest');
 assert.equal(check({scrollTop:9145,direction:1,hasNewer:false}),null);
 assert.equal(check({scrollTop:40,direction:1}),null);
 assert.equal(check({scrollTop:9145,direction:-1}),null);
 assert.equal(check({scrollTop:40,direction:-1,recentGesture:false}),null);
 assert.equal(check({scrollTop:40,direction:-1,transitionBlocked:true}),null);
 assert.equal(check({scrollTop:40,direction:-1,loadingOlder:true}),null);
 assert.equal(check({scrollTop:40,direction:-1,hasOlder:false}),null);
 assert.equal(check({scrollTop:40,direction:-1,scrollHeight:800}),null);
});

test('Bounded window keeps the scroll anchor when entering the newest range',()=>{
 const timeline=readFileSync(new URL('../apps/pwa/src/features/chat/ChatTimeline.tsx',import.meta.url),'utf8');
 assert.match(timeline,/onScroll=\{handleWindowScroll\}/);
 assert.match(timeline,/onTouchMove=\{markGesture\}/);
 assert.match(timeline,/nextWindowAllowedAt\.current=now\+420/);
 assert.match(timeline,/if\(nextMessage\)setEndAnchorKey\(chatWindowKey\(nextMessage\)\)/);
 assert.doesNotMatch(timeline,/if\(nextEnd===windowed\.total\)\{setEndAnchorKey\(null\);onReturnLatest\(\);\}/);
});
