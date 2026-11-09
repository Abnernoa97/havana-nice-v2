import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('HOME keeps one authorized Chat engine but mounts no message, video or composer view',()=>{
  const pwa=read('apps/pwa/src/app/App.tsx');
  const native=read('apps/android/app/NativeApp.tsx');
  assert.ok(pwa.includes("(!session||activeScreen==='chat')&&<div className=\"member-chat-visible\">"));
  assert.ok(native.includes("(!session||activeScreen==='chat'||restoringAccess)&&<KeyboardAvoidingView"));
  assert.match(pwa,/const socket = useRef<WebSocket \| null>\(null\)/);
  assert.match(native,/const socket = useRef<WebSocket \| null>\(null\)/);
  for(const code of [pwa,native]){
    assert.match(code,/const \[draft, setDraft\] = useState\(''\)/);
    assert.match(code,/captureChatOfflineSnapshot\(/);
    assert.doesNotMatch(code,/setSession\(null\).*target!=='chat'/);
    assert.doesNotMatch(code,/searchChatMessages|runSearch\(|searchHistory\(|setSearching\(|searchResults/);
  }
  assert.doesNotMatch(pwa,/member-chat-hidden|searchResults/);
  assert.doesNotMatch(native,/styles\.inactiveChat|setResults\(/);
});

test('Pickers, keyboard subscriptions and uploads remain independent actions',()=>{
  const pwa=read('apps/pwa/src/app/App.tsx');
  const native=read('apps/android/app/NativeApp.tsx');
  const keyboard=read('apps/android/hooks/useNativeKeyboardVisibility.ts');
  assert.match(pwa,/const \{uploadChatFile\}=await import\('\.\.\/services\/chat-media-upload'\)/);
  assert.doesNotMatch(pwa,/^import \{uploadChatFile\}/m);
  assert.match(native,/useNativeKeyboardVisibility\(activeScreen==='chat'\)/);
  assert.match(keyboard,/if\(!enabled\)\{setVisible\(false\);return;\}/);
  assert.match(keyboard,/\},\[enabled\]\)/);
  assert.match(pwa,/setComposerPanel\(null\);setMenuMessage\(null\)/);
  assert.match(native,/setComposerPanel\(null\);setMenuMessage\(null\)/);
  assert.match(read('apps/pwa/src/features/chat/ChatTimeline.tsx'),/onSwipeRight=\{\(\)=>onReply\(message\)\}/);
  assert.match(read('apps/android/features/chat/NativeChatTimeline.tsx'),/onReply=\{\(\) => onReply\(message\)\}/);
});

test('Inactive chat and old search styling are not required for a single action',()=>{
  const webStyle=read('apps/pwa/src/styles/chat/chat.css');
  const nativeStyle=read('apps/android/styles/chat-styles.ts');
  assert.doesNotMatch(webStyle,/\.member-chat-hidden\{display:none\}|\.chat-search\{/);
  assert.doesNotMatch(nativeStyle,/inactiveChat:|searchInput:|searchCount:/);
});
