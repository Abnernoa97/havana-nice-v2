import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureChatOfflineSnapshot,restoreChatOfflineOutbox} from '../packages/shared/src/chat-offline.ts';

const session={token:'private-token',actorId:'member:fer',displayName:'Fer',expiresAt:'2100-01-01T00:00:00.000Z'};
const message=(id,deliveryStatus='sending')=>({
 seq:-1,clientMessageId:id,senderId:'member:fer',senderName:'Fer',
 text:'Hola',sentAt:'2026-11-07T14:00:00.000Z',pending:true,failed:false,deliveryStatus,
});

test('one offline snapshot preserves session, draft and interrupted edit without new IDs',()=>{
 const queued=message('m_original','sending');
 const editing={...queued,seq:42,pending:false,text:'Texto antes de editar'};
 const beforeEdit={draft:'Borrador original',replyTo:editing};
 const snapshot=captureChatOfflineSnapshot(session,[queued],'Nuevo texto',editing,beforeEdit);
 assert.equal(snapshot.session,session);
 assert.equal(snapshot.draft,'Nuevo texto');
 assert.equal(snapshot.editing,editing);
 assert.equal(snapshot.beforeEdit,beforeEdit);
 assert.deepEqual(snapshot.outbox.map(x=>x.clientMessageId),['m_original']);
 assert.equal(snapshot.outbox[0].deliveryStatus,'queued');
 assert.equal(snapshot.outbox[0].pending,true);
 assert.equal(queued.deliveryStatus,'sending','never mutate caller or active outbox');
 assert.equal(captureChatOfflineSnapshot(null,[queued],'secret',editing,beforeEdit),null);
});

test('restored outbox requeues all interrupted messages in creation order',()=>{
 const rows=[message('first','error'),message('second','sending')];
 const restored=restoreChatOfflineOutbox(rows);
 assert.deepEqual([...restored.keys()],['first','second']);
 assert.equal(restored.get('first').deliveryStatus,'queued');
 assert.equal(restored.get('second').deliveryStatus,'queued');
 assert.equal(restored.get('first').pending,true);
 assert.equal(rows[0].deliveryStatus,'error','do not rewrite loaded snapshot');
 assert.deepEqual([...restoreChatOfflineOutbox([]).keys()],[]);
});

test('compatibility: no new IndexedDB or Android SQLite storage keys are introduced',()=>{
 const pwa=readFileSync(new URL('../apps/pwa/src/services/local.ts',import.meta.url),'utf8');
 const android=readFileSync(new URL('../apps/android/services/chatStorage.ts',import.meta.url),'utf8');
 assert.match(pwa,/const KEY = 'offline-outbox-v1'/);
 assert.match(android,/const KEY = 'havana-v2-chat-local-v1'/);
 assert.match(pwa,/indexedDB\.open\(DB, 1\)/);
 assert.match(android,/expo-sqlite\/kv-store/);
 const helper=readFileSync(new URL('../packages/shared/src/chat-offline.ts',import.meta.url),'utf8');
 assert.doesNotMatch(helper,/indexedDB|Storage\.setItem|saveLocalChat|AsyncStorage|WebSocket/);
});

test('one snapshot and restore policy is consumed by both V2 client controllers',()=>{
 for(const path of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
  const code=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(code,/captureChatOfflineSnapshot\(/,path);
  assert.match(code,/restoreChatOfflineOutbox\(saved\.outbox/,path);
  assert.match(code,/editingSnapshot\.current,beforeEdit\.current/,path);
  assert.doesNotMatch(code,/new Map\(saved\.outbox/,path);
  assert.doesNotMatch(code,/outbox: \[\.\.\.outbox\.current\.values\(\)\]\.map/,path);
 }
 const index=readFileSync(new URL('../packages/shared/src/index.ts',import.meta.url),'utf8');
 assert.match(index,/export \{captureChatOfflineSnapshot,restoreChatOfflineOutbox\} from '\.\/chat-offline'/);
});
