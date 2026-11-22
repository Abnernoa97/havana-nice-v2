import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('An Android State appears on PWA even without a matching Profile row',()=>{
 const roster=read('apps/pwa/src/features/home/TeamStoriesStrip.tsx');
 const pwa=read('apps/pwa/src/features/stories/useMemberStories.ts');
 const native=read('apps/android/features/stories/NativeStories.tsx');
 const nativeApi=read('apps/android/features/stories/useNativeStories.ts');
 const shared=read('packages/shared/src/member-stories.ts');
 assert.match(roster,/new Map\(profiles\.map\(person=>\[person\.actorId,person\]\)\)/);
 assert.match(roster,/for\(const story of stories\)/);
 assert.match(roster,/members\.set\(story\.actorId/);
 assert.match(roster,/\[\.\.\.members\.values\(\)\]/);
 assert.match(native,/for\(const story of states\.stories\)/);
 assert.match(native,/members\.set\(story\.actorId/);
 assert.match(pwa,/window\.setInterval\(\(\)=>\{/);
 assert.match(nativeApi,/const fallback=setInterval\(\(\)=>\{/);
 assert.match(shared,/\/api\/stories\/team/);
 for(const s of [pwa,nativeApi])
  assert.match(s,/45_000/);
});

test('Holding Android Chat text reliably opens emoji menu without competing responder',()=>{
 const bubble=read('apps/android/features/chat/SwipeableBubble.tsx');
 const menu=read('apps/android/features/chat/NativeChatMessageMenu.tsx');
 assert.doesNotMatch(bubble,/PanResponder\.create\(/);
 assert.match(bubble,/onPressIn=\{event=>\{/);
 assert.match(bubble,/timer\.current=setTimeout\(\(\)=>open\(\),470\)/);
 assert.match(bubble,/onLongPress=\{event=>\{open\(event\);\}\}/);
 assert.match(bubble,/onTouchMove=\{event=>\{/);
 assert.match(bubble,/callbacks\.current\.onReply\(\)/);
 assert.match(bubble,/callbacks\.current\.onLongPress\(\{/);
 assert.match(menu,/\['👍','❤️','😂'\]/);
 assert.match(menu,/visible=\{!!message\}/);
});

test('Unread private notification count is visible on both platforms',()=>{
 const pwa=read('apps/pwa/src/app/VisualApp.tsx');
 const native=read('apps/android/app/NativeMemberHome.tsx');
 const webHook=read('apps/pwa/src/features/notices/usePwaUnreadNotices.ts');
 const phoneHook=read('apps/android/features/notices/useNativeUnreadNotices.ts');
 assert.match(pwa,/usePwaUnreadNotices\(/);
 assert.match(native,/useNativeUnreadNotices\(/);
 assert.match(pwa,/hn-notices-count/);
 assert.match(native,/styles\.unreadBadge/);
 assert.match(webHook,/getMemberNotices\(token\)/);
 assert.match(phoneHook,/getMemberNotices\(token\)/);
 assert.doesNotMatch(webHook+phoneHook,/new WebSocket|localStorage|PushNotification/);
});

test('The unsolicited 3D Audio effect is entirely absent from both builds',()=>{
 const pwa=read('apps/pwa/src/features/audio/MemberAudio.tsx');
 const css=read('apps/pwa/src/features/audio/audio-player.css');
 const native=read('apps/android/features/audio/NativeAudioEditorialView.tsx');
 const packageJson=JSON.parse(read('apps/android/package.json'));
 const html=read('apps/android/features/audio/nativeAudioEditorialHtml.ts');
 assert.doesNotMatch(pwa+css+native+html,/useAudioDiscMotion|havanaAudioTilt|hn-motion-active|--hn-disc-x|--hn-disc-y/);
 assert.equal(packageJson.dependencies['expo-sensors'],undefined);
 assert.match(native,/NATIVE_AUDIO_EDITORIAL_HTML/);
 assert.match(read('apps/android/features/audio/NativeAudio.tsx'),/useAudioPlaylist\(/);
});
