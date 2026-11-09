import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recoverChatAccess} from '../packages/shared/src/chat-session-recovery.ts';

const saved={token:'existing-private-token',actorId:'member:fer',displayName:'Fer',expiresAt:'2100-01-01T00:00:00Z'};
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('validated session uses server identity and never replaces token with old local credentials',async()=>{
 const updated={...saved,token:'server-revalidated-token'};
 assert.deepEqual(await recoverChatAccess(saved,async incoming=>{
  assert.equal(incoming,saved);return updated;
 }),{state:'authorized',session:updated});
});

test('confirmed revocation discards the session instead of returning the offline fallback',async()=>{
 assert.deepEqual(await recoverChatAccess(saved,async()=>null),{state:'revoked',session:null});
});

test('network failure keeps the existing offline session for later retry, no extra login',async()=>{
 let calls=0;
 const result=await recoverChatAccess(saved,async()=>{calls++;throw Error('offline');});
 assert.equal(calls,1);
 assert.deepEqual(result,{state:'offline',session:saved});
});

test('PWA and native use one restoration decision while retaining their own socket transports',()=>{
 const web=read('apps/pwa/src/app/App.tsx');
 const native=read('apps/android/app/NativeApp.tsx');
 const platformSocket=read('apps/android/services/native-chat-socket.ts');
 const shared=read('packages/shared/src/index.ts');
 for(const src of [web,native]){
  assert.match(src,/chatSessionExpired\(saved\.session\)/);
  assert.match(src,/recoverChatAccess\(saved\.session,restoreNamedChatSession\)/);
  assert.match(src,/access\.state==='revoked'/);
  assert.match(src,/const approved=access\.session/);
  assert.match(src,/restoreChatOfflineOutbox\(saved\.outbox/);
  assert.match(src,/captureChatOfflineSnapshot\(/);
 }
 assert.match(shared,/export \{recoverChatAccess\} from '\.\/chat-session-recovery'/);
 assert.match(web,/const ws = openChatSocket\(next\)/);
 assert.match(native,/ws = openNativeChatSocket\(next\)/);
 assert.match(platformSocket,/Authorization:`Bearer \$\{session\.token\}`/);
 assert.match(platformSocket,/\['havana-v2'\]/);
 assert.doesNotMatch(platformSocket,/setTimeout|retry|\.onmessage|localStorage|sessionStorage|AsyncStorage/);
 assert.doesNotMatch(native,/new NativeWebSocket\(/);
});
