import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Android BOOK uses the native session for a fast gallery, never a second browser login',()=>{
 const native=read('apps/android/features/book/NativeBook.tsx');
 assert.match(native,/getBookPages\(token\)/);
 assert.match(native,/getCalendarMemories\(token,calendarEventId\)/);
 assert.match(native,/bookMediaUrl\(item.url\)/);
 assert.match(native,/<FlatList/);
 assert.match(native,/horizontal pagingEnabled/);
 assert.match(native,/initialNumToRender=\{1\}/);
 assert.match(native,/windowSize=\{3\}/);
 assert.match(native,/BOOK_GRANT_RENEW_MS/);
 assert.match(native,/AppState.addEventListener\('change'/);
 assert.match(native,/pwaReaderUrl\(target\)/);
 assert.doesNotMatch(native,/WebView|react-native-webview|postMessage|injectJavaScript|havana-v2-book-auth|new PageFlip/);
 assert.doesNotMatch(native,/\?token=|localStorage|AsyncStorage|startNamedChatSession|restoreNamedChatSession/);
});
test('PWA is the single original 3D renderer and receives only a safe route after authorization',()=>{
 const reader=read('apps/pwa/src/features/book/BookReader.tsx');
 const pwa=read('apps/pwa/src/app/PwaReaderRoute.tsx');
 const app=read('apps/pwa/src/app/App.tsx');
 assert.match(reader,/new PageFlip\(/);
 assert.match(pwa,/const MemberBook=lazy/);
 assert.match(pwa,/const CalendarMemories=lazy/);
 assert.match(pwa,/getCalendarEvents\(token,HAVANA_V2_DEV_API_BASE_URL\)/);
 assert.match(app,/parsePwaReaderHash\(window.location.hash\)/);
 assert.match(app,/readerRoute\?<PwaReaderRoute token=\{session.token\}/);
 assert.match(app,/restoreNamedChatSession/);
 assert.doesNotMatch(pwa,/startNamedChatSession|restoreNamedChatSession|new WebSocket/);
});
