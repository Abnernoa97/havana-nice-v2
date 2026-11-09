import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {BOOK_ORIGIN,BOOK_READER_URL,bookContextDeliveryScript,trustedBookUrl} from '../apps/android/features/book/book-bridge.ts';
import {parseNativeBookContext} from '../apps/pwa/src/app/native-book-context.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='A'.repeat(64);
const event='781c1e49-216e-475b-8245-a4efb1b7250b';

test('Android opens the PWA 3D directly in its own shell with the existing login',()=>{
 const n=read('apps/android/features/book/NativeBook.tsx');
 assert.match(n,/<WebView<object>/);
 assert.match(n,/onMessage=\{event=>onReaderStatus\(event.nativeEvent.data\)\}/);
 assert.match(n,/onLoadEnd=/);
 assert.match(n,/phaseRef.current==='script-started'/);
 assert.doesNotMatch(n,/if\(trustedBookUrl\(event.nativeEvent.url\)\)/);
 assert.match(n,/Do NOT mask the embedded page/);
 assert.doesNotMatch(n,/loading:\{position:'absolute',top:90,bottom:0/);
 assert.match(n,/readerWatchdog/);
 assert.match(n,/ActivityIndicator/);
 assert.match(n,/message.type!=='havana-v2-book-status'/);
 assert.doesNotMatch(n,/injectedJavaScriptObject=/);
 assert.match(n,/bookContextDeliveryScript\(nativeContext\)/);
 assert.match(n,/\.injectJavaScript\(bookContextDeliveryScript/);
 assert.match(n,/source=\{\{uri:READER\}\}/);
 assert.match(n,/const READER=BOOK_READER_URL;/);
 assert.equal(BOOK_READER_URL,BOOK_ORIGIN+'/book');
 assert.equal(trustedBookUrl(BOOK_READER_URL),true);
 assert.equal(trustedBookUrl(BOOK_ORIGIN+'/book.html'),false);
 assert.equal(trustedBookUrl('https://untrusted.example/book'),false);
 assert.match(n,/location\.pathname==="\/book"/);
 assert.match(n,/token,eventId:calendarEventId\|\|''/);
 assert.match(n,/onShouldStartLoadWithRequest=\{event=>trustedBookUrl\(event.url\)\}/);
 assert.match(n,/domStorageEnabled=\{false\}/);
 assert.match(n,/thirdPartyCookiesEnabled=\{false\}/);
 assert.match(n,/setSupportMultipleWindows=\{false\}/);
 assert.match(n,/window.dispatchEvent\(new Event\("havana-v2-book-refresh"\)\)/);
 assert.doesNotMatch(n,/Linking\.|Alert\.alert|pwaReaderUrl|FlatList|getBookPages|havana-v2-book-auth|AUTHORIZED|injectedJavaScriptBeforeContentLoaded/);
 assert.doesNotMatch(n,/\?token=|localStorage|AsyncStorage|startNamedChatSession|restoreNamedChatSession/);
});
test('The embedded PWA uses PageFlip and a single native-boot session delivery, without browser login',()=>{
 const p=read('apps/pwa/src/app/native-book-main.tsx');
 const h=read('apps/pwa/book.html');
 const reader=read('apps/pwa/src/features/book/BookReader.tsx');
 assert.doesNotMatch(p,/\.injectedObjectJson\?\.\(|attempts>=30/);
 assert.match(p,/window.addEventListener\('havana-v2-book-context',onContext\)/);
 assert.match(p,/reportReaderPhase\('boot'\)/);
 assert.match(p,/parseNativeBookContext\(/);
 assert.match(p,/const MemberBook=lazy/);
 assert.match(p,/parseNativeBookContext\(typeof detail==='string'\?detail:null\)/);
 assert.match(p,/\.hn-book-empty:not\(\[role\]\)/);
 assert.match(p,/reportReaderStatus\(state\)/);
 assert.match(p,/reportReaderPhase\('boot'\)/);
 assert.match(p,/reportReaderPhase\('session'\)/);
 assert.match(p,/sendPhase\('pages'\)/);
 assert.doesNotMatch(p,/JSON\.stringify\(\{[^}]*token[^}]*\}\)/);
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
test('Android session delivery only targets the trusted BOOK origin and returns event metadata',()=>{
 const payload={token,eventId:event,title:'Recuerdo "A" <B>'};
 const delivered=[];
 const js=bookContextDeliveryScript(payload);
 class NativeEvent{constructor(type,options){this.type=type;this.detail=options.detail;}}
 const window={dispatchEvent:e=>delivered.push(e)};
 const normal={window,location:{origin:BOOK_ORIGIN,pathname:'/book',search:'',hash:''},CustomEvent:NativeEvent};
 runInNewContext(js,normal);
 assert.equal(delivered.length,1);
 assert.deepEqual(JSON.parse(delivered[0].detail),payload);
 assert.ok(!js.includes('localStorage')&&!js.includes('document.cookie'));
 for(const wrong of [{origin:'https://untrusted.example',pathname:'/book'},
  {origin:BOOK_ORIGIN,pathname:'/admin'},
  {origin:BOOK_ORIGIN,pathname:'/book',search:'?token=bad'}]){
  delivered.length=0;
  runInNewContext(js,{window,CustomEvent:NativeEvent,location:{
   origin:wrong.origin,pathname:wrong.pathname,search:wrong.search||'',hash:''}});
  assert.equal(delivered.length,0);
 }
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
