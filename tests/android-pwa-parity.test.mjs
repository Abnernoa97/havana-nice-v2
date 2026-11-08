import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Android Calendar has no old 30 second polling and uses the same private CalendarRoom as PWA',()=>{
 const calendar=read('apps/android/features/calendar/NativeCalendar.tsx');
 const transport=read('apps/android/services/native-calendar-live.ts');
 const pwa=read('apps/pwa/src/services/calendar-live.ts');
 assert.match(calendar,/watchNativeCalendar\(token/);
 assert.doesNotMatch(calendar,/setInterval|30000|new WebSocket/);
 assert.match(transport,/new WebSocket\(url,\['havana-v2-calendar','session\.'\+token\]\)/);
 assert.match(transport,/calendar\.invalidate/);
 assert.match(transport,/AppState\.addEventListener\('change'/);
 assert.doesNotMatch(transport,/setInterval|30000|localStorage|AsyncStorage|chat_messages|CHAT_ROOMS/);
 assert.match(pwa,/calendar\.invalidate/);
});

test('Músicos reads one authorized roster in both apps without a second login',()=>{
 const shared=read('packages/shared/src/musicians.ts');
 const web=read('apps/pwa/src/features/musicians/MemberMusicians.tsx');
 const native=read('apps/android/features/musicians/NativeMusicians.tsx');
 assert.match(shared,/getFamilyDirectory\(token\)/);
 assert.doesNotMatch(shared,/new WebSocket|fetch\(|adminLogin|\/api\/chat\/admin/);
 assert.match(web,/getMusicianDirectory\(token\)/);
 assert.match(web,/useFamilyLive\(token,false/);
 assert.match(native,/getMusicianDirectory\(token\)/);
 assert.match(native,/openFamilyRealtime\(token,false/);
 assert.match(native,/FAMILY_WS_HANDSHAKE_TIMEOUT_MS/);
 assert.match(read('apps/pwa/src/app/VisualApp.tsx'),/screen==='musicians'&&token\?<MemberMusicians token=\{token\}/);
 assert.match(read('apps/android/features/home/NativeMemberHome.tsx'),/active==='musicians'\?<NativeMusicians token=\{token\}/);
 assert.match(read('packages/shared/src/memberModules.ts'),/id:'musicians'[^\n]*ready:true,nativeReady:true/);
});
test('one private Repertoire invalidation channel synchronizes Admin, PWA and Android',()=>{
 const entry=read('cloudflare/src/index.ts');
 const room=read('cloudflare/src/modules/calendar/calendar-realtime.js');
 const browserTransport=read('apps/pwa/src/services/calendar-live.ts');
 const nativeTransport=read('apps/android/services/native-calendar-live.ts');
 const admin=read('apps/pwa/src/features/repertoire/AdminRepertoire.tsx');
 const member=read('apps/pwa/src/features/repertoire/MemberRepertoire.tsx');
 const android=read('apps/android/features/repertoire/NativeRepertoire.tsx');
 assert.match(entry,/ctx\.waitUntil\(notifyRepertoireClients\(env\)\)/);
 assert.match(room,/type:'repertoire.invalidate'/);
 assert.match(browserTransport,/watchRepertoire\(token/);
 assert.match(nativeTransport,/watchNativeRepertoire\(token/);
 assert.match(admin,/watchRepertoire\(token,true/);
 assert.match(member,/watchRepertoire\(token,false/);
 assert.match(android,/watchNativeRepertoire\(token/);
 for(const s of [admin,member,android])assert.doesNotMatch(s,/setInterval\(/);
});
test('Android HOME has same mobile destinations and visual navigation as PWA, not stale placeholders',()=>{
 const shared=read('packages/shared/src/memberModules.ts');
 const home=read('apps/android/features/home/NativeMemberHome.tsx');
 const pwa=read('apps/pwa/src/app/VisualApp.tsx');
 assert.match(shared,/id:'repertoire'[^\n]*ready:true,nativeReady:true/);
 assert.match(shared,/id:'family'[^\n]*ready:true,nativeReady:true/);
 assert.match(home,/active==='repertoire'\?<NativeRepertoire token=\{token\}/);
 assert.match(home,/active==='family'\?<NativeFamily token=\{token\}/);
 assert.match(home,/styles\.bottomNav/);
 assert.match(home,/\['home','chat','calendar','repertoire','family'\]/);
 assert.match(home,/width:'100%'/);
 assert.match(pwa,/visual-bottom-nav/);
 assert.doesNotMatch(home,/WebView|startNamedChatSession|restoreNamedChatSession|new WebSocket/);
});

test('Admin Repertorio does not overwrite newer edits with old Calendar/catalog responses',()=>{
 const src=read('apps/pwa/src/features/repertoire/AdminRepertoire.tsx');
 assert.match(src,/const catalogRequest=useRef\(0\)/);
 assert.match(src,/const request=\+\+catalogRequest\.current/);
 assert.match(src,/if\(request!==catalogRequest\.current\)return/);
 assert.match(src,/catalogRequest\.current\+\+;window\.clearInterval\(timer\)/);
 assert.match(src,/e instanceof CalendarHttpError&&e.status===401/);
 assert.match(src,/if\(request===catalogRequest\.current\)setLoading\(false\)/);
});
test('Android Repertorio consumes exactly the PWA member D1 catalog and assigned event contracts',()=>{
 const native=read('apps/android/features/repertoire/NativeRepertoire.tsx');
 const pwa=read('apps/pwa/src/features/repertoire/MemberRepertoire.tsx');
 for(const api of ['getRepertoireSongs','getCalendarEvents','getAssignedEventRepertoire','safeRepertoireLink','calendarDate']){
  assert.ok(native.includes(api)&&pwa.includes(api),api);
 }
 assert.match(native,/AppState\.addEventListener/);
 assert.match(native,/item\.completed/);
 assert.doesNotMatch(native,/fetch\('https?:|chat_messages|startNamedChatSession|localStorage/);
});

test('Android Familia reads the same albums, authorized grant URLs and real BOOK state as PWA',()=>{
 const native=read('apps/android/features/family/NativeFamily.tsx');
 const pwa=read('apps/pwa/src/features/family/MemberFamily.tsx');
 for(const api of ['getFamilyDirectory','getFamilyAlbumMedia','familyAlbumCount']){
  assert.ok(native.includes(api)&&pwa.includes(api),api);
 }
 assert.match(native,/\/api\/family\/media\//);
 assert.match(native,/getFamilyAlbumMedia\(token,actorId\)/);
 const book=read('apps/android/features/book/NativeBook.tsx');
 const web=read('apps/pwa/src/app/native-book-main.tsx');
 const reader=read('apps/pwa/src/features/book/BookReader.tsx');
 assert.match(native,/<NativeBook token=\{token\} refreshKey=\{bookTick\} onClose=\{back\}\/>/);
 assert.match(book,/from 'react-native-webview'/);
 assert.match(book,/\/book\.html/);
 assert.match(book,/havana-v2-book-auth/);
 assert.match(book,/havana-v2-book-refresh/);
 assert.match(book,/trustedBookUrl/);
 assert.match(web,/havana-v2-book-ready/);
 assert.match(reader,/from 'page-flip'/);
 assert.doesNotMatch(book,/localStorage|AsyncStorage|WebSocket|new PageFlip|\?token=/);
 assert.doesNotMatch(native,/No hay ediciones publicadas todavía/);
 assert.match(native,/VideoView/);
 assert.doesNotMatch(native,/MEDIA_BUCKET|CHAT_ROOMS|startNamedChatSession|localStorage|Supabase|HAVANA_CLOUD/);
});

test('Native Chat uploads the unchanged original quality to the same R2 endpoints with 3 concurrent 5MiB parts',()=>{
 const android=read('apps/android/App.tsx');
 const helper=read('apps/android/services/native-chat-r2-upload.ts');
 const pwa=read('apps/pwa/src/services/chat-media-upload.ts');
 assert.match(android,/uploadNativeChatFile\(session,item/);
 assert.doesNotMatch(android,/Almacenamiento multimedia no configurado/);
 assert.match(android,/mediaUploading/);
 assert.match(helper,/new File\(picked\.uri\)/);
 assert.match(helper,/import \{fetch as expoFetch\} from 'expo\/fetch'/);
 assert.match(helper,/createUploadTask\(/);
 assert.match(helper,/UploadType\.BINARY_CONTENT/);
 assert.match(helper,/file\.slice\(start,end,mimeType\)/);
 assert.match(helper,/5\*1024\*1024/);
 assert.match(helper,/Math\.min\(3,total\)/);
 assert.match(pwa,/Math\.min\(3,begin\.partCount\)/);
 assert.match(helper,/\/complete/);
 assert.match(helper,/\/send/);
 assert.doesNotMatch(helper,/base64|writeAsStringAsync|HAVANA_CLOUD|Drive|Supabase/);
});

test('Android remains an explicit signed batch and the existing install is never reset',()=>{
 const manifest=read('.github/workflows/v2-android-apk.yml');
 const android=read('apps/android/app.json');
 assert.match(manifest,/android-batch\.json/);
 assert.match(manifest,/approved!==true/);
 assert.match(manifest,/apksigner/);
 assert.match(manifest,/apk-signature-gate\.py/);
 assert.match(android,/"package": "com\.havananice\.v2"/);
 assert.doesNotMatch(read('apps/android/App.tsx'),/clearApplicationData|deleteDatabase|uninstallApp/);
});
