import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('PWA and Android contain failed socket constructors within the sole Chat owner',()=>{
 const pwa=read('apps/pwa/src/features/chat/usePwaChatController.ts');
 const android=read('apps/android/features/chat/useNativeChatController.ts');
 assert.match(pwa,/try\{ws=openChatSocket\(next\);\}/);
 assert.match(pwa,/catch\{\s*setConnection\('sin conexión'\);\s*setError\('No se pudo iniciar la conexión/);
 assert.match(pwa,/socket\.current = ws;/);
 assert.match(android,/try \{\s*ws = openNativeChatSocket\(next\);/);
 assert.match(android,/setError\('No se pudo iniciar la conexión/);
 for(const code of [pwa,android]){
  assert.match(code,/connectionTimers\.current\.watchHandshake\(/);
  assert.match(code,/connectionTimers\.current\.scheduleRetry\(/);
  assert.match(code,/connectionTimers\.current\.clearAll\(/);
  assert.doesNotMatch(code,/new WebSocket\(/);
 }
});
