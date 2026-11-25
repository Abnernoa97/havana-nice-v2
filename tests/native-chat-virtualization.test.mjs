import {readNativeSource} from './helpers/native-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>path==='apps/android/app/NativeApp.tsx'?
  readNativeSource(import.meta.url):readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Native Chat virtualizes messages instead of creating the complete history tree',()=>{
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 assert.match(timeline,/import \{[^}]*\bFlatList\b[^}]*\} from 'react-native'/);
 assert.match(timeline,/<FlatList/);
 assert.match(timeline,/data=\{visibleMessages\}/);
 assert.match(timeline,/\binverted\b/);
 // The grouped gallery must filter deleted messages before constructing cells,
 // retain one representative per two-column row, and invert chronology once.
 assert.match(timeline,/const galleries=useMemo\(\(\)=>groupChatMediaMessages\(messages\.filter\(message=>!message\.deletedAt\)\),\[messages\]\)/);
 assert.match(timeline,/for\(let i=0;i<group.length;\)/);
 assert.match(timeline,/const count=i===0&&group.length%2===1\?1:2/);
 assert.match(timeline,/i\+=count/);
 assert.match(timeline,/const items=group.slice\(i,i\+count\)/);
 assert.match(timeline,/visibleMessages:rows.reverse\(\)/);
 assert.match(timeline,/grouped.first&&<Text style=\{styles.gallerySender\}/);
 assert.match(timeline,/grouped.last&&delivery\(message,true\)/);
 assert.match(timeline,/ListFooterComponent=\{<>/);
 assert.match(timeline,/groupLeads\.get\(message\.senderId\+':'\+message\.clientMessageId\)/);
 assert.match(timeline,/if\(!grouped\)return renderBubble\(message\)/);
 assert.match(timeline,/grouped\.items\.map\(item=>/);
 assert.match(timeline,/keyExtractor=\{message=>message.senderId\+':'\+message.clientMessageId\}/);
 assert.match(timeline,/initialNumToRender=\{10\}/);
 assert.match(timeline,/maxToRenderPerBatch=\{8\}/);
 assert.match(timeline,/windowSize=\{7\}/);
 assert.match(timeline,/removeClippedSubviews=\{false\}/);
 assert.doesNotMatch(timeline,/<ScrollView|\.map\(message\s*=>/);
});
test('Virtual list preserves native video surfaces, old-page loading, deletes, reply/menu and scroll ownership',()=>{
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 const controller=read('apps/android/app/NativeApp.tsx');
 for(const part of [
  /maintainVisibleContentPosition=\{\{minIndexForVisible:0\}\}/,
  /hasMore\?<Pressable/,/onPress=\{\(\)=>void onLoadOlder\(\)\}/,
  /message=>!message.deletedAt/,/onReply=\{\(\) => onReply\(message\)\}/,
  /onLongPress=\{\(anchor\) => onMessageLongPress\(message,anchor\)\}/,
  /<NativeChatMediaView media=\{message.media\} session=\{session\} compact=\{compact\}/,
  /display\.reactionBadges\.get\(message.seq\)/,
  /display\.deliveryFor\(message\)/,
  /onScrollBeginDrag=\{onScrollBeginDrag\}/,
  /onMomentumScrollEnd=\{onScrollEndDrag\}/,
 ])assert.match(timeline,part);
 assert.match(controller,/const scroll\s*=\s*useRef<FlatList<ChatMessage>\s*\|\s*null>\(null\)/);
 assert.match(controller,/scroll\.current\?\.scrollToOffset\(\{offset:0,animated:false\}\)/);
 assert.doesNotMatch(controller,/scroll\.current\?\.scrollToEnd\(\{animated:false\}\)/);
 assert.match(controller,/userHasScrolled\.current=true/);
 assert.match(controller,/onScrollEndDrag=\{onTimelineScrollEndDrag\}/);
 assert.doesNotMatch(timeline,/new WebSocket|AsyncStorage|saveNativeLocalChat|uploadNativeChatFile/);
});

test('Long pressing native Chat opens emoji actions directly from touch without async measurements',()=>{
 const gesture=read('apps/android/features/chat/SwipeableBubble.tsx');
 const menu=read('apps/android/features/chat/NativeChatMessageMenu.tsx');
 assert.match(gesture,/onLongPress=\{event=>\{/);
 assert.match(gesture,/event\.nativeEvent/);
 assert.match(gesture,/callbacks\.current\.onLongPress\(\{/);
 assert.doesNotMatch(gesture,/\.measureInWindow\(/);
 assert.match(menu,/\['👍','❤️','😂'\]/);
 assert.match(menu,/onPress=\{event=>\{event\.stopPropagation\(\);onReact\(message,emoji/);
 assert.match(menu,/visible=\{!!message\}/);
 assert.match(menu,/backdropTouchStarted=React\.useRef\(false\)/);
 assert.match(menu,/onPressIn=\{\(\)=>\{backdropTouchStarted\.current=true;\}\}/);
 assert.doesNotMatch(menu,/openedAt|Date\.now\(\)-openedAt/);
});

test('History reception never schedules scroll work without a mounted native timeline',()=>{
 const viewport=read('apps/android/features/chat/useNativeChatViewport.ts');
 const controller=read('apps/android/features/chat/useNativeChatController.ts');
 assert.match(viewport,/if \(!scroll\.current \|\| !initialHistoryPending\.current \|\| !initialHistoryLoaded\.current \|\| userHasScrolled\.current\) return;/);
 assert.match(viewport,/if \(!scroll\.current \|\| !initialHistoryPending\.current \|\| userHasScrolled\.current\) return;/);
 assert.match(controller,/if\(initialHistoryPending\.current&&scroll\.current\)requestAnimationFrame\(scheduleInitialBottom\)/);
 assert.match(viewport,/if\(activeScreen!=='chat'\|\|!sessionToken\)return/);
 assert.match(controller,/syncMessages\(next\)/);
 assert.match(controller,/flushOutbox\(\)/);
});


test('Native mosaic avoids redundant dimensions and Android photo fade',()=>{
 const photo=read('apps/android/features/chat/NativeChatPhoto.tsx');
 assert.match(photo,/setPhoto\(uri\);[\s\S]*?if\(compact\)return;[\s\S]*?Image.getSize\(uri/);
 assert.match(photo,/if\(known\)\{setRatio\(known\);return;\}/);
 assert.match(photo,/<Image source=\{\{uri:photo\}\} fadeDuration=\{0\}/);
 assert.match(photo,/cacheWholePhoto\(media,signed\)/);
});


test('Odd albums have one wide first tile and complete two-column rows; even albums stay paired',()=>{
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 const start=timeline.indexOf('  const rows:ChatMessage[]=[];');
 const end=timeline.indexOf(' },[galleries]);',start);
 assert.ok(start>=0&&end>start);
 const code=timeline.slice(start,end).replace('const rows:ChatMessage[]','const rows')
  .replace('new Map<string,{items:ChatMessage[];first:boolean;last:boolean}>()','new Map()')
  .replaceAll(']!;','];').replaceAll(']!);',']);');
 const project=new Function('galleries',code);
 for(let n=1;n<=101;n++){
  const messages=Array.from({length:n},(_,i)=>({senderId:'a',clientMessageId:String(i),seq:i+1}));
  const result=project([messages]);
  assert.equal(result.visibleMessages.length,Math.ceil(n/2));
  if(n===1){assert.equal(result.groupLeads.size,0);continue;}
  const rows=[...result.visibleMessages].reverse().map(m=>result.groupLeads.get(m.senderId+':'+m.clientMessageId));
  assert.equal(rows[0].items.length,n%2===1?1:2);
  assert.ok(rows.slice(1).every(row=>row.items.length===2));
  assert.deepEqual(rows.flatMap(row=>row.items),messages);
  assert.equal(rows.filter(row=>row.first).length,1);
  assert.equal(rows.filter(row=>row.last).length,1);
  assert.ok(rows[0].first&&rows.at(-1).last);
 }
 assert.match(timeline,/grouped.items.length===1&&styles.galleryWideCell/);
 assert.match(timeline,/renderBubble\(item,true,grouped.items.length===1\)/);
});
