import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 chatSessionExpired,chatReconnectDelay,CHAT_RECONNECT_MAX_DELAY_MS,CHAT_WS_HANDSHAKE_TIMEOUT_MS
} from '../packages/shared/src/chat-connection.ts';

const now=Date.parse('2026-11-07T14:00:00.000Z');
const session=expiresAt=>({expiresAt});

test('both chat clients keep the existing session expiry edge behavior',()=>{
 assert.equal(chatSessionExpired(session(new Date(now-1).toISOString()),now),true);
 assert.equal(chatSessionExpired(session(new Date(now).toISOString()),now),true);
 assert.equal(chatSessionExpired(session(new Date(now+1).toISOString()),now),false);
 // The previous Date.parse <= Date.now() check treated invalid dates as not expired.
 assert.equal(chatSessionExpired(session('invalid-date'),now),false);
});

test('one retry policy preserves the original backoff, max 20 seconds',()=>{
 assert.equal(CHAT_RECONNECT_MAX_DELAY_MS,20000);
 assert.deepEqual(Array.from({length:9},(_,i)=>chatReconnectDelay(i+1)),
 [1000,2000,4000,8000,16000,20000,20000,20000,20000]);
});

test('both clients recover stalled WebSocket handshakes through their existing reconnect owner',()=>{
 assert.equal(CHAT_WS_HANDSHAKE_TIMEOUT_MS,9000);
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(source,/connectionWatchdog=useRef/);
  assert.match(source,/connectionWatchdog\.current=setTimeout\(/);
  assert.match(source,/ws\.readyState===WebSocket\.OPEN/);
  assert.match(source,/CHAT_WS_HANDSHAKE_TIMEOUT_MS/);
  assert.match(source,/clearConnectionWatchdog\(\)/);
  assert.match(source,/try\{ws\.close\(\);\}catch\{\}\s*retry\(\)/);
 }
});
test('PWA/Android use one expiry and retry policy without an extra socket',()=>{
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
  const s=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(s,/chatSessionExpired\(next\)/,path);
  assert.match(s,/chatSessionExpired\(saved\.session\)/,path);
  assert.match(s,/chatReconnectDelay\((retryCount|retryAttempts)\.current\)/,path);
  assert.doesNotMatch(s,/Math\.min\(20000.*retryCount|Math\.min\(20000.*retryAttempts/,path);
  assert.doesNotMatch(s,/Date\.parse\((next|saved\.session)\.expiresAt\)\s*<=\s*Date\.now\(\)/,path);
  assert.match(s,/socket\.current\s*=\s*ws/,path);
  assert.match(s,/activeSession\.current/,path);
 }
 const shared=readFileSync(new URL('../packages/shared/src/chat-connection.ts',import.meta.url),'utf8');
 assert.doesNotMatch(shared,/WebSocket|setTimeout|localStorage|AsyncStorage|fetch\(/);
 const exports=readFileSync(new URL('../packages/shared/src/index.ts',import.meta.url),'utf8');
 assert.match(exports,/export \{chatSessionExpired,chatReconnectDelay,CHAT_RECONNECT_MAX_DELAY_MS,CHAT_WS_HANDSHAKE_TIMEOUT_MS\} from '\.\/chat-connection'/);
});
