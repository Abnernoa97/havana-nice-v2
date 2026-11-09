import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNativeBookContext} from '../apps/pwa/src/app/native-book-context.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='A'.repeat(64);
const event='781c1e49-216e-475b-8245-a4efb1b7250b';

test('Android opens the PWA 3D directly in its own shell with the existing login',()=>{
 const n=read('apps/android/features/book/NativeBook.tsx');
 assert.match(n,/<WebView<object>/);
 assert.match(n,/onMessage=/);
 assert.match(n,/readerWatchdog/);
 assert.match(n,/ActivityIndicator/);
 assert.match(n,/message.type!=='havana-v2-book-status'/);
 assert.match(n,/injectedJavaScriptObject=\{nativeContext\}/);
 assert.match(n,/source=\{\{uri:READER\}\}/);
 assert.match(n,/token,eventId:calendarEventId\|\|''/);
 assert.match(n,/onShouldStartLoadWithRequest=\{event=>trustedBookUrl\(event.url\)\}/);
 assert.match(n,/domStorageEnabled=\{false\}/);
 assert.match(n,/thirdPartyCookiesEnabled=\{false\}/);
 assert.match(n,/setSupportMultipleWindows=\{false\}/);
 assert.match(n,/window.dispatchEvent\(new Event\("havana-v2-book-refresh"\)\)/);
 assert.doesNotMatch(n,/Linking\.|Alert\.alert|pwaReaderUrl|FlatList|getBookPages|havana-v2-book-auth|AUTHORIZED|injectedJavaScriptBeforeContentLoaded/);
 assert.doesNotMatch(n,/\?token=|localStorage|AsyncStorage|startNamedChatSession|restoreNamedChatSession/);
});
test('The embedded PWA uses the original PageFlip and initial native context, no external login',()=>{
 const p=read('apps/pwa/src/app/native-book-main.tsx');
 const h=read('apps/pwa/book.html');
 const reader=read('apps/pwa/src/features/book/BookReader.tsx');
 assert.match(p,/\.ReactNativeWebView\?\.injectedObjectJson\?\.\(\)/);
 assert.match(p,/parseNativeBookContext\(json\)/);
 assert.match(p,/const MemberBook=lazy/);
 assert.match(p,/reportReaderStatus\(state\)/);
 assert.match(p,/stf__block/);
 assert.match(h,/id="book-boot-status"/);
 assert.match(p,/JSON\.stringify\(\{type:'havana-v2-book-status',status\}\)/);
 assert.match(p,/const CalendarMemories=lazy/);
 assert.match(p,/<CalendarMemories token=\{context.token\}/);
 assert.match(reader,/new PageFlip\(/);
 assert.match(h,/Content-Security-Policy/);
 assert.match(h,/frame-src 'none'/);
 assert.match(h,/script-src 'self'/);
 assert.doesNotMatch(p,/startNamedChatSession|restoreNamedChatSession|window\.location\.search|localStorage|new WebSocket/);
});
test('One-time native object strictly validates the event and token without persistence',()=>{
 assert.deepEqual(parseNativeBookContext(JSON.stringify({token,eventId:'',title:''})),
  {token,memory:null});
 assert.deepEqual(parseNativeBookContext(JSON.stringify({token,eventId:event.toUpperCase(),title:'Recuerdo'})),
  {token,memory:{eventId:event,title:'Recuerdo'}});
 assert.equal(parseNativeBookContext(null),null);
 assert.equal(parseNativeBookContext('not-json'),null);
 assert.equal(parseNativeBookContext(JSON.stringify({token:'invalid'})),null);
 assert.equal(parseNativeBookContext(JSON.stringify({token,eventId:'../../etc/passwd'})),null);
 assert.equal(parseNativeBookContext(JSON.stringify({token,eventId:'a'.repeat(700)})),null);
});
