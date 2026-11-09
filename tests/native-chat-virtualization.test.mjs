import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Native Chat virtualizes messages instead of creating the complete history tree',()=>{
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 assert.match(timeline,/import \{FlatList,/);
 assert.match(timeline,/<FlatList/);
 assert.match(timeline,/data=\{visibleMessages\}/);
 assert.match(timeline,/useMemo\(\s*\(\)=>messages\.filter\(message=>!message\.deletedAt\)/);
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
  /<NativeChatMediaView media=\{message.media\} session=\{session\}/,
  /display\.reactionBadges\.get\(message.seq\)/,
  /display\.lastReadByOther>=message.seq/,
  /onScrollBeginDrag=\{onScrollBeginDrag\}/,
  /onMomentumScrollEnd=\{onScrollEndDrag\}/,
 ])assert.match(timeline,part);
 assert.match(controller,/const scroll = useRef<FlatList<ChatMessage> \| null>\(null\)/);
 assert.match(controller,/scroll\.current\?\.scrollToEnd\(\{animated:false\}\)/);
 assert.match(controller,/userHasScrolled\.current=true/);
 assert.match(controller,/onScrollEndDrag=\{trackUserScroll\}/);
 assert.doesNotMatch(timeline,/new WebSocket|AsyncStorage|saveNativeLocalChat|uploadNativeChatFile/);
});
