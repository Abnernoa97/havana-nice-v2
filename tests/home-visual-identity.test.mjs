import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('PWA HOME uses a scoped lightweight emerald-gold theme without affecting Chat or BOOK',()=>{
 const css=read('apps/pwa/src/styles/home/home.css');
 assert.match(css,/\.visual-shell\{--hn-forest:#133B30;--hn-deep:#0D2A23;/);
 assert.match(css,/--hn-gold:#B69358;--hn-gold-light:#DBC59A/);
 assert.match(css,/\.visual-header\{[^\n]*background:var\(--hn-deep\)/);
 assert.match(css,/\.visual-tile:focus-visible/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.doesNotMatch(css,/(?:^|\n):root\{/,'HOME theme must not change Chat CSS root tokens');
 const app=read('apps/pwa/src/app/VisualApp.tsx');
 assert.match(app,/className="visual-tile"/);
 assert.match(app,/onClick=\{\(\)=>navigate\(item.id\)\}/);
 assert.match(app,/aria-current=\{screen===item.id\?'page':undefined\}/);
 assert.doesNotMatch(app,/new WebSocket|startNamedChatSession|uploadChatMediaBatch/);
});
test('Android HOME presentation keeps one session and direct native modules',()=>{
 const app=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(app,/backgroundColor:'#0D2A23'/);
 assert.match(app,/color:'#DBC59A'/);
 assert.match(app,/active==='family'[\s\S]*?familyViewport/);
 assert.match(app,/active==='calendar'\?<NativeCalendar token=\{token\}/);
 assert.match(app,/onPress=\{\(\)=>onNavigate\(module.id\)\}/);
 assert.doesNotMatch(app,/new WebSocket|startNamedChatSession|WebView|AsyncStorage/);
});
