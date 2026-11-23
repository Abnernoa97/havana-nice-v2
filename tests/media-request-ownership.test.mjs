import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function loadTs(path){
 const compiled=ts.transpileModule(read(path),{
  fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 });
 const exports={};
 runInNewContext(compiled.outputText,{exports,Map});
 return exports;
}
test('stale private album request cannot remove newer in-flight media read',async()=>{
 const {finishFamilyAlbumRequest}=loadTs('apps/pwa/src/features/family/family-request-coordination.ts');
 const inflight=new Map();
 let finishOld,finishNew;
 const old=new Promise(resolve=>{finishOld=resolve;}).finally(()=>finishFamilyAlbumRequest(inflight,'fer',old));
 inflight.set('fer',old);
 inflight.clear(); // A live Familia invalidation begins a new generation.
 const fresh=new Promise(resolve=>{finishNew=resolve;}).finally(()=>finishFamilyAlbumRequest(inflight,'fer',fresh));
 inflight.set('fer',fresh);
 finishOld();
 await old;
 assert.equal(inflight.get('fer'),fresh,'old response must not evict new request');
 finishNew();
 await fresh;
 assert.equal(inflight.has('fer'),false,'current request is removed when complete');
});
test('private Chat gallery discards signed URLs when authorized session changes',()=>{
 const {keepChatGrantsForToken}=loadTs('apps/pwa/src/features/chat/chat-gallery-grant-scope.ts');
 const scope={owner:'member-old',entries:new Map([['shared-photo',{url:'https://private.test/old',at:123}]])};
 keepChatGrantsForToken(scope,'member-old');
 assert.equal(scope.entries.size,1,'same session retains a warm grant');
 keepChatGrantsForToken(scope,'member-new');
 assert.equal(scope.owner,'member-new');
 assert.equal(scope.entries.size,0,'new member cannot reuse old private URL');
 scope.entries.set('shared-photo',{url:'https://private.test/new',at:234});
 keepChatGrantsForToken(scope,'member-new');
 assert.equal(scope.entries.get('shared-photo').url,'https://private.test/new');
});
test('media preview consumers enforce request and session ownership without extra caches',()=>{
 const family=read('apps/pwa/src/features/family/MemberFamily.tsx');
 const gallery=read('apps/pwa/src/features/chat/ChatMediaGallery.tsx');
 assert.match(family,/finishFamilyAlbumRequest\(albumInflight\.current,actorId,job\)/);
 assert.match(family,/cacheEpoch\.current===epoch/);
 assert.match(family,/itemsActor===selected/);
 assert.match(gallery,/keepChatGrantsForToken\(grants\.current,token\)/);
 assert.match(gallery,/grants\.current\.owner!==token/);
 assert.match(gallery,/abort\.abort\(\)/);
 assert.match(gallery,/Date\.now\(\)-warm\.at<8\*60\*1000/);
 assert.doesNotMatch(gallery,/localStorage|indexedDB|sessionStorage|new WebSocket/);
});
