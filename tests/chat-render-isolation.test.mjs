import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Typing and draft state do not rerender the complete Chat timelines',()=>{
 const web=read('apps/pwa/src/app/App.tsx');
 const native=read('apps/android/app/NativeApp.tsx');
 const webTimeline=read('apps/pwa/src/features/chat/ChatTimeline.tsx');
 const nativeTimeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 assert.match(webTimeline,/export default memo\(ChatTimeline\)/);
 assert.match(nativeTimeline,/export default memo\(NativeChatTimeline\)/);
 for(const controller of [web,native]){
   assert.match(controller,/const timelineActions=useRef\(/);
   assert.match(controller,/useLayoutEffect\(\(\)=>\{\s*timelineActions\.current=/);
   for(const name of ['LoadOlder','Reply','LongPress','Retry']){
     assert.match(controller,new RegExp('const onTimeline'+name+'=useCallback\\('));
     assert.match(controller,new RegExp('on'+(name==='LoadOlder'?'LoadOlder':name==='Reply'?'Reply':name==='LongPress'?'MessageLongPress':'Retry')+'=\\{onTimeline'+name+'\\}'));
   }
 }
 assert.match(native,/onContentSizeChange=\{onTimelineContentChange\}/);
 assert.match(native,/onLayout=\{onTimelineContentChange\}/);
 assert.match(native,/onScrollBeginDrag=\{onTimelineScrollBeginDrag\}/);
 assert.match(native,/onScroll=\{onTimelineScroll\}/);
 assert.match(native,/onScrollEndDrag=\{onTimelineScrollEndDrag\}/);
});

test('Message updates and offline delivery still reach the timeline independently',()=>{
 const web=read('apps/pwa/src/app/App.tsx');
 const native=read('apps/android/app/NativeApp.tsx');
 const webTimeline=read('apps/pwa/src/features/chat/ChatTimeline.tsx');
 const nativeTimeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 for(const app of [web,native]){
   assert.match(app,/messages=\{messages\}/);
   assert.match(app,/reactions=\{reactions\} receipts=\{receipts\}/);
   assert.match(app,/onlineActorIds=\{onlineActorIds\} connected=\{connection==='en vivo'\}/);
   assert.match(app,/const \[draft, setDraft\] = useState\(''\)/);
   assert.match(app,/flushOutbox\(\)/);
 }
 assert.match(webTimeline,/onSwipeRight=\{\(\)=>onReply\(message\)\}/);
 assert.match(nativeTimeline,/onReply=\{\(\) => onReply\(message\)\}/);
 assert.match(nativeTimeline,/<FlatList/);
 assert.match(nativeTimeline,/removeClippedSubviews=\{false\}/);
});
