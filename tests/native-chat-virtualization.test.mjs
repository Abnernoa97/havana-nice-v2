import {readNativeSource} from './helpers/native-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>path==='apps/android/app/NativeApp.tsx'?
  readNativeSource(import.meta.url):readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Native Chat virtualizes messages instead of creating the complete history tree',()=>{
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 assert.match(timeline,/import \{FlatList,/);
 assert.match(timeline,/<FlatList/);
 assert.match(timeline,/data=\{visibleMessages\}/);
 assert.match(timeline,/\binverted\b/);
 // The grouped gallery must filter deleted messages before constructing cells,
 // retain one representative per group, and invert chronological order once.
 assert.match(timeline,/const galleries=useMemo\(\(\)=>groupChatMediaMessages\(messages\.filter\(message=>!message\.deletedAt\)\),\[messages\]\)/);
 assert.match(timeline,/const visibleMessages=useMemo\(\(\)=>galleries\.map\(group=>group\[group\.length-1\]!\)\.reverse\(\),\[galleries\]\)/);
 assert.match(timeline,/ListFooterComponent=\{<>/);
 assert.match(timeline,/groupLeads\.get\(message\.clientMessageId\)/);
 assert.match(timeline,/if\(!grouped\)return renderBubble\(message\)/);
 assert.match(timeline,/grouped\.map\(item=>/);
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
  /display\.lastReadByOther>=message.seq/,
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
