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
 // Expired/failed R2 grants must not leave a blank native/PWA state forever.
 assert.match(shared,/serverNow/);
 assert.match(shared,/story\.expiresAt>serverNow/);
 assert.match(native,/last\?\.photoUrl\|\|person\.photoUrl/);
 assert.match(native,/onFailure=/);
 assert.match(native,/states\.retryAll\(\)/);
 for(const hook of [pwa,nativeApi]){
  assert.match(hook,/failedPhotos=useRef\(new Map/);
  assert.match(hook,/failedPhotos\.current\.clear\(\)/);
  assert.match(hook,/photoGrants\.current\.delete\(id\)|grants\.current\.delete\(id\)/);
  assert.match(hook,/recent&&prior\.attempts>=2/);
 }
 for(const s of [pwa,nativeApi])
  assert.match(s,/45_000/);
});

test('Android story upload uses actual Expo File blobs, never unsupported URI FormData parts',()=>{
 const native=read('apps/android/features/stories/useNativeStories.ts');
 const strip=read('apps/android/features/stories/NativeStories.tsx');
 const server=read('cloudflare/src/modules/stories/stories.js');
 assert.match(native,/import \{fetch as expoFetch\} from 'expo\/fetch'/);
 assert.match(native,/import \{File\} from 'expo-file-system'/);
 assert.match(native,/const file=await prepare\(asset\.uri\)/);
 assert.match(native,/form\.append\('photos',file,'estado-'\+\(i\+1\)\+'\.jpg'\)/);
 assert.match(native,/await expoFetch\(API\+'\/api\/stories\/me\/batch'/);
 assert.doesNotMatch(native,/form\.append\('photos',\{uri:/);
 assert.doesNotMatch(native,/as unknown as Blob/);
 assert.match(server,/form\.getAll\('photos'\)/);
 assert.match(server,/files\.length<1\|\|files\.length>5/);
 assert.match(strip,/Aún no tienes estados/);
 assert.match(strip,/aún no tiene estados/);
 assert.match(native,/No se pudo enviar la foto/);
 assert.match(native,/publishing=useRef\(false\)/);
 assert.match(native,/if\(saving\|\|publishing\.current\)return/);
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
 // The initial long-press release is not a fresh backdrop tap, and emoji
 // selection cannot bubble into the dismiss gesture.
 assert.match(menu,/backdropTouchStarted=React\.useRef\(false\)/);
 assert.match(menu,/onShow=\{\(\)=>\{backdropTouchStarted\.current=false;\}\}/);
 assert.match(menu,/onPressIn=\{\(\)=>\{backdropTouchStarted\.current=true;\}\}/);
 assert.match(menu,/event\.stopPropagation\(\)/);
 assert.doesNotMatch(menu,/openedAt|Date\.now\(\)-openedAt/);
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
 assert.match(phoneHook,/getMemberNotices\(token,API,signal\)/);
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
