import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('PWA and Android share a notification-only transport with no tokens in URLs',()=>{
 const shared=read('packages/shared/src/family-realtime.ts');
 assert.match(shared,/\/ws\/family/);
 assert.match(shared,/\['havana-v2-family','session\.'\+token\]/);
 assert.match(shared,/\['havana-v2-admin','admin\.'\+token\]/);
 assert.match(shared,/new WebSocket\(url,protocols\)/);
 assert.doesNotMatch(shared,/\?token|localStorage|indexedDB|\/api\/family\/media\/|object_key|setInterval/);
 const index=read('packages/shared/src/index.ts');
 assert.match(index,/export \{openFamilyRealtime\} from '\.\/family-realtime'/);
});

test('Both PWA Family screens refresh albums and media on the one live signal',()=>{
 const hook=read('apps/pwa/src/services/use-family-live.ts');
 const member=read('apps/pwa/src/features/family/MemberFamily.tsx');
 const admin=read('apps/pwa/src/features/family/AdminFamily.tsx');
 assert.match(hook,/openFamilyRealtime\(token,admin,event=>/);
 assert.match(hook,/event\.type==='family.ready'\|\|event\.type==='family.invalidate'/);
 assert.match(hook,/document\.addEventListener\('visibilitychange',resume\)/);
 assert.match(hook,/window\.addEventListener\('online',resume\)/);
 assert.doesNotMatch(hook,/setInterval\(/);
 for(const [source,role] of [[member,'false'],[admin,'true']]){
  assert.match(source,new RegExp('useFamilyLive\\(token,'+role+','));
  assert.match(source,/setMediaTick\(t=>t\+1\)/);
  assert.match(source,/getFamilyAlbumMedia\(token,selected/);
 }
 assert.doesNotMatch(member,/new WebSocket/);
 assert.doesNotMatch(admin,/new WebSocket/);
});

test('Android Familia uses the same socket, with one AppState-aware connection and no polling',()=>{
 const native=read('apps/android/features/family/NativeFamily.tsx');
 assert.match(native,/openFamilyRealtime\(token,false,event=>/);
 assert.match(native,/event\.type==='family.ready'\|\|event\.type==='family.invalidate'/);
 assert.match(native,/AppState\.addEventListener\('change',state=>/);
 assert.match(native,/socket\?\.close\(\)/);
 assert.match(native,/if\(selectedRef\.current\)void loadAlbum\(selectedRef\.current\)/);
 assert.doesNotMatch(native,/setInterval|WebView|new WebSocket/);
 assert.match(native,/getFamilyDirectory\(token\)/);
});

test('Family Worker uses existing D1, R2 and ChatRoom bindings without an extra backend',()=>{
 const src=read('cloudflare/src/index.ts');
 const room=read('cloudflare/src/modules/chat/chat-room.ts');
 assert.match(src,/env\.CHAT_ROOMS\.get\(env\.CHAT_ROOMS\.idFromName\(ROOM\)\)\.fetch\(request\)/);
 assert.match(src,/handleFamilyApi\(request,env,url,origin,respond,verifySession,ctx\)/);
 assert.match(room,/await verifyAdminSession\(adminTokenRequest\(adminToken\),this\.env\)/);
 assert.match(room,/await verifySession\(this\.env,memberToken\)/);
 assert.doesNotMatch(src,/new WebSocket\(/);
});
