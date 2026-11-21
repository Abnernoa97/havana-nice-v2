import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Android memories open the SAME approved BOOK inline on accordion expansion',()=>{
 const cal=read('apps/android/features/calendar/NativeCalendar.tsx');
 const book=read('apps/android/features/book/NativeBook.tsx');
 const pwa=read('apps/pwa/src/features/calendar/CalendarAccordion.tsx');
 assert.match(cal,/<NativeBook embedded token=\{token\}/);
 assert.match(cal,/open===item.id/);
 assert.doesNotMatch(cal,/Abrir recuerdo con efecto BOOK|setArchive\(/);
 assert.match(book,/return embedded\?reader:<Modal/);
 assert.match(book,/source=\{\{uri:READER\}\}/);
 assert.match(book,/bookContextDeliveryScript\(nativeContext\)/);
 assert.match(pwa,/<CalendarMemories token=\{token\}/);
});

test('Android story safe space and explicit five-photo navigation do not alter BOOK',()=>{
 const story=read('apps/android/features/stories/NativeStoryViewer.tsx');
 const home=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(story,/paddingBottom:Platform.OS==='android'\?48:0/);
 assert.match(story,/Ver foto '\+\(i\+1\)/);
 assert.match(story,/setPosition\(i\)/);
 assert.match(story,/Foto siguiente/);
 assert.match(story,/Foto anterior/);
 assert.match(home,/StatusBar.currentHeight/);
 assert.doesNotMatch(story,/WebView|PageFlip/);
});

test('Android uses the same single Chat reaction method for bubble, badge and context menu',()=>{
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 const surface=read('apps/android/features/chat/NativeChatSurface.tsx');
 assert.match(timeline,/onQuickReact\(message,emoji as ChatEmoji/);
 assert.match(timeline,/Elegir reacción para mensaje/);
 assert.match(surface,/const reactWithEffect=/);
 assert.match(surface,/onQuickReact=\{reactWithEffect\}/);
 assert.match(surface,/onReact=\{reactWithEffect\}/);
 assert.doesNotMatch(timeline+surface,/new WebSocket\(|startNamedChatSession\(/);
});

test('Both notification tabs use one authenticated contract and the existing Familia signal',()=>{
 const native=read('apps/android/features/notices/NativeNotices.tsx');
 const pwa=read('apps/pwa/src/features/notices/MemberNotices.tsx');
 const contract=read('packages/shared/src/member-notifications.ts');
 const worker=read('cloudflare/src/index.ts');
 const handler=read('cloudflare/src/modules/notices/member-notifications.js');
 assert.match(read('apps/android/app/NativeMemberHome.tsx'),/<NativeNotices token=\{token\}/);
 assert.match(read('apps/pwa/src/app/VisualApp.tsx'),/<MemberNotices token=\{token\}/);
 assert.match(native,/getMemberNotices\(token\)/);
 assert.match(native,/openFamilyRealtime\(token,false/);
 assert.match(pwa,/getMemberNotices\(token\)/);
 assert.match(pwa,/useFamilyLive\(token,false/);
 assert.match(contract,/\/api\/notices\/read/);
 assert.match(worker,/handleMemberNotices\(request,env,url,origin,verifySession\)/);
 assert.match(handler,/WHERE n.recipient_id=\?/);
 assert.match(handler,/WHERE id=\? AND recipient_id=\?/);
 assert.doesNotMatch(native+pwa+handler,/startNamedChatSession|restoreNamedChatSession|new D1Database|sendPushNotification/);
});
