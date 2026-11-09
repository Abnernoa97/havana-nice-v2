import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Both musician Chat clients use a full-viewport conversation without old navigation or search',()=>{
  const pwa=read('apps/pwa/src/app/App.tsx');
  const native=read('apps/android/app/NativeApp.tsx');
  assert.doesNotMatch(pwa,/className="chat-header"|className="chat-search"|<h1>Chat/);
  assert.doesNotMatch(native,/style=\{styles\.header\}|style=\{styles\.searchRow\}|Chat V2/);
  assert.match(pwa,/onNavigate=\{navigateTo\}/);
  assert.match(native,/onNavigate=\{navigateTo\}/);
});

test('The shared live presence marks real senders, not an estimated online count',()=>{
  const pwa=read('apps/pwa/src/app/App.tsx');
  const native=read('apps/android/app/NativeApp.tsx');
  const webTimeline=read('apps/pwa/src/features/chat/ChatTimeline.tsx');
  const nativeTimeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
  for(const src of [pwa,native]){
    assert.match(src,/Set\(.*\.users.*map\(user=>user\.actorId\)/);
    assert.match(src,/onlineActorIds=\{onlineActorIds\}/);
  }
  assert.match(webTimeline,/connected&&onlineActorIds\.has\(message\.senderId\)/);
  assert.match(nativeTimeline,/connected&&onlineActorIds\.has\(message\.senderId\)/);
  assert.match(read('apps/pwa/src/styles/chat/chat.css'),/\.bubble\.online\{background:#123D32/);
  assert.match(read('apps/android/styles/chat-styles.ts'),/onlineBubble:\{backgroundColor:'#123D32'/);
});

test('Long press offers only emojis; swipe remains the only reply gesture',()=>{
  const pwa=read('apps/pwa/src/features/chat/PwaChatMessageMenu.tsx');
  const native=read('apps/android/features/chat/NativeChatMessageMenu.tsx');
  for(const src of [pwa,native]){
    assert.match(src,/\['👍','❤️','😂'\]/);
    assert.doesNotMatch(src,/Responder|whatsappActionBar|whatsapp-actions|onEdit|onDelete|onReply/);
  }
  assert.match(read('apps/pwa/src/features/chat/SwipeMessage.tsx'),/onSwipeRight\(\)/);
  assert.match(read('apps/android/features/chat/SwipeableBubble.tsx'),/callbacks\.current\.onReply\(\)/);
  assert.match(read('apps/pwa/src/styles/chat/chat.css'),/\.chat-messages \.bubble \*\{user-select:none!important/);
  assert.match(read('apps/pwa/src/features/chat/SwipeMessage.tsx'),/addEventListener\('selectstart',preventNativeSelection\)/);
});

test('Native OS back and iPhone edge swipe return within the authorized app',()=>{
  const pwa=read('apps/pwa/src/app/App.tsx');
  const native=read('apps/android/app/NativeApp.tsx');
  assert.match(pwa,/window\.history\.pushState\(/);
  assert.match(pwa,/window\.addEventListener\('popstate',syncBack\)/);
  assert.match(pwa,/edgeSwipeStart\.current/);
  assert.match(native,/BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(native,/onMoveShouldSetPanResponderCapture/);
  assert.match(native,/setActiveScreen\(previousScreen\.current\)/);
  for(const src of [pwa,native]) assert.doesNotMatch(src,/removeNativeLocalChat\(|deleteDatabase\(|clearApplicationData\(/);
});

test('Opening Chat lands at the true bottom even after media sizes change',()=>{
  const pwa=read('apps/pwa/src/app/App.tsx');
  const native=read('apps/android/app/NativeApp.tsx');
  const timeline=read('apps/pwa/src/features/chat/ChatTimeline.tsx');
  const css=read('apps/pwa/src/styles/chat/chat.css');
  assert.match(timeline,/className="chat-message-content"/);
  assert.match(css,/\.chat-message-content\{display:flex;/);
  const scroll=read('apps/pwa/src/features/chat/useChatScrollAnchor.ts');
  assert.match(pwa,/useChatScrollAnchor\(\{/);
  assert.match(scroll,/observer\.observe\(content\)/);
  assert.match(scroll,/list\.scrollTop=Math\.max\(0,list\.scrollHeight-list\.clientHeight\)/);
  assert.match(scroll,/else if\(userScrollGesture\.current\)stickToLatest\.current=false/);
  assert.match(scroll,/observer\.observe\(list\)/);
  assert.match(scroll,/if\(skipOlderRef\.current\)\{skipOlderRef\.current=false;return;\}/);
  assert.match(native,/initialBottomAttempts = useRef\(0\)/);
  assert.match(native,/if\(initialBottomAttempts\.current<10\)scheduleInitialBottom\(\)/);
  assert.match(native,/else if\(autoScroll\.current\)scroll\.current\?\.scrollToEnd\(\{animated:false\}\)/);
  assert.match(native,/onScrollBeginDrag=\{onTimelineScrollBeginDrag\}/);
});
