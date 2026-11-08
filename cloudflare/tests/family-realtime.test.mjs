import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {notifyFamilyClients} from '../src/modules/family/family-realtime.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Familia invalidation reuses exactly the existing main ChatRoom DO',async()=>{
 const calls=[];
 const env={CHAT_ROOMS:{
  idFromName(name){calls.push(['room',name]);return 'room-1';},
  get(id){
   assert.equal(id,'room-1');
   return {fetch:async(url,opts)=>{
    calls.push(['fetch',url,opts.method]);
    return new Response(JSON.stringify({ok:true}),{status:200});
   }};
  }
 }};
 await notifyFamilyClients(env);
 assert.deepEqual(calls,[['room','main-chat-v2'],['fetch','https://internal/family-invalidate','POST']]);
});

test('Network failure cannot rollback completed D1/R2 upload or cause unhandled errors',async()=>{
 await notifyFamilyClients({});
 await notifyFamilyClients({CHAT_ROOMS:{
  idFromName:()=>1,
  get:()=>({fetch:async()=>{throw new Error('DO temporarily unavailable');}})
 }});
 await notifyFamilyClients({CHAT_ROOMS:{
  idFromName:()=>1,
  get:()=>({fetch:async()=>new Response(null,{status:503})})
 }});
});

test('Invalidations happen only after successful mutations; not from media reads',()=>{
 const sourceText=source('src/modules/family/family.js');
 for(const snippet of [
  'signalSaved(await deleteFamilyMedia(',
  'signalSaved(await selectFamilyCover(',
  'signalSaved(await uploadFamilyPoster(',
  'signalSaved(await uploadFamilyMedia(',
  "request.method==='POST'&&transfer.complete?signalSaved(result):result",
 ]){
  assert.ok(sourceText.includes(snippet),'Missing notification path: '+snippet);
 }
 assert.match(sourceText,/if\(result\.ok\)/);
 assert.match(sourceText,/ctx\?\.waitUntil/);
 assert.doesNotMatch(sourceText,/setInterval|new WebSocket/);
});

test('Existing Worker verifies Family subscribers independently and does not broadcast Chat content',()=>{
 const worker=source('src/index.ts');
 const room=source('src/modules/chat/chat-room.ts');
 assert.match(worker,/url\.pathname==='\/ws\/family'/);
 assert.match(worker,/verifyAdminSession\(adminTokenRequest\(adminToken\),env\)/);
 assert.match(worker,/verifySession\(env,memberToken\)/);
 assert.match(room,/this\.familySockets = new Map\(\)/);
 assert.match(room,/async invalidateFamilyClients\(\)/);
 assert.match(room,/this\.send\(socket,\{type:'family.invalidate'\}\)/);
 assert.match(room,/socket\.close\(4003,'Access revoked'\)/);
 assert.match(worker,/ctx\.waitUntil\(notifyFamilyClients\(env\)\)/);
 assert.doesNotMatch(worker,/new DurableObjectNamespace|new R2Bucket/);
});
