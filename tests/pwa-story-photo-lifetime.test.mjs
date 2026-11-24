import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const compiled=ts.transpileModule(read('apps/pwa/src/features/stories/story-photo-pool.ts'),{
 fileName:'story-photo-pool.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
function photoPool(persisted=new Map(),readOverride=null){
 const exports={},revoked=[];let requests=0,objects=0;
 let currentOwner='';
 const URL={
  createObjectURL:()=>('blob:temporary-'+(++objects)),
  revokeObjectURL:value=>revoked.push(value),
 };
 class Image{
  decoding='async';
  set src(value){this.value=value;}
  async decode(){}
 }
 const fetch=async()=>{requests++;return {ok:true,blob:async()=>({type:'image/jpeg',size:70000})};};
 runInNewContext(compiled,{exports,URL,Image,fetch,Date,Map,Set,Promise,Error,setTimeout,clearTimeout,
  require(id){
   assert.equal(id,'../../services/private-image-cache');
   return {
    readPrivateImage:readOverride|| (async(token,key)=>persisted.get(token+'|'+key)||null),
    storePrivateImage:async(token,key,blob)=>{persisted.set(token+'|'+key,blob);},
   };
  }
 });
 return {api:exports,requests:()=>requests,revoked};
}
const story=(url,createdAt=1000)=>({
 id:'same-immutable-story',actorId:'fer',name:'Fer',
 photoUrl:url,createdAt,expiresAt:Date.now()+60_000,
});

test('iPhone HOME/Chat navigation reuses a decoded photo across renewed private grants',async()=>{
 const p=photoPool();
 p.api.setStoryPhotoOwner('session-fer');
 const first=story('https://worker.example/api/stories/photo/first');
 const url=await p.api.warmStoryPhoto(first);
 assert.equal(p.requests(),1);
 assert.equal(p.api.getWarmStoryPhoto(first),url);
 const refreshed={...first,photoUrl:'https://worker.example/api/stories/photo/renewed'};
 assert.equal(p.api.getWarmStoryPhoto(refreshed),url);
 assert.equal(await p.api.warmStoryPhoto(refreshed),url);
 assert.equal(p.requests(),1,'same bytes are not re-downloaded after route re-entry');
 p.api.setStoryPhotoOwner('session-fer');
 assert.equal(p.api.getWarmStoryPhoto(refreshed),url);
 assert.deepEqual(p.revoked,[]);
});
test('switching musicians destroys all old photos and requires fresh private authorization',async()=>{
 const p=photoPool();
 const first=story('https://worker.example/api/stories/photo/first');
 p.api.setStoryPhotoOwner('session-fer');
 const local=await p.api.warmStoryPhoto(first);
 p.api.setStoryPhotoOwner('session-noa');
 assert.equal(p.api.getWarmStoryPhoto(first),'');
 assert.deepEqual(p.revoked,[local]);
 await p.api.warmStoryPhoto({...first,photoUrl:'https://worker.example/api/stories/photo/other'});
 assert.equal(p.requests(),2);
});
test('same story id with different immutable metadata is not a stale cache hit',async()=>{
 const p=photoPool();
 p.api.setStoryPhotoOwner('session-fer');
 const original=story('https://worker.example/api/stories/photo/first');
 await p.api.warmStoryPhoto(original);
 assert.equal(p.api.getWarmStoryPhoto({...original,createdAt:2000}),'');
 await p.api.warmStoryPhoto({...original,createdAt:2000});
 assert.equal(p.requests(),2);
});
test('only the session shell owns picture memory; HOME keeps strict independent lazy modules',()=>{
 const shell=read('apps/pwa/src/features/chat/PwaChatSurface.tsx');
 const home=read('apps/pwa/src/features/stories/useMemberStories.ts');
 const visual=read('apps/pwa/src/app/VisualApp.tsx');
 assert.match(shell,/setStoryPhotoOwner\(session\?\.token\)/);
 assert.match(shell,/return\(\)=>setStoryPhotoOwner\(undefined\)/);
 assert.doesNotMatch(home,/setStoryPhotoOwner\(undefined\)/);
 for(const module of ['CalendarAccordion','MemberRepertoire','MemberFamily','MemberHome'])
  assert.match(visual,new RegExp('const '+module+'=lazy\\('));
 const pool=read('apps/pwa/src/features/stories/story-photo-pool.ts');
 assert.doesNotMatch(pool,/indexedDB|localStorage|sessionStorage|caches\.open|CacheStorage|new WebSocket/);
});

test('closing and reopening the iPhone PWA restores expiring encrypted Stories without a second R2 request',async()=>{
 const persisted=new Map();
 const original=story('https://worker.example/api/stories/photo/first');
 const first=photoPool(persisted);
 first.api.setStoryPhotoOwner('session-fer');
 await first.api.warmStoryPhoto(original);
 assert.equal(first.requests(),1);
 const reopened=photoPool(persisted);
 reopened.api.setStoryPhotoOwner('session-fer');
 const url=await reopened.api.warmStoryPhoto({...original,photoUrl:'https://worker.example/api/stories/photo/new-grant'});
 assert.match(url,/^blob:/);
 assert.equal(reopened.requests(),0,'a previously viewed story must open without refetching R2');
 const otherMusician=photoPool(persisted);
 otherMusician.api.setStoryPhotoOwner('session-noa');
 await otherMusician.api.warmStoryPhoto(original);
 assert.equal(otherMusician.requests(),1,'other musicians never read a different session cache');
});
test('saved stories expire with the story and do not become permanent profile photos',()=>{
 const pool=read('apps/pwa/src/features/stories/story-photo-pool.ts');
 assert.match(pool,/storePrivateImage\(requestOwner,cacheId,blob,story\.expiresAt\)/);
 assert.match(pool,/readPrivateImage\(requestOwner,cacheId\)/);
 assert.match(pool,/requestOwner!==owner/);
 assert.match(pool,/story\.expiresAt<=Date\.now\(\)/);
 assert.doesNotMatch(pool,/localStorage|sessionStorage|CacheStorage|new WebSocket/);
});

test('a stalled iPhone IndexedDB cannot block loading a valid Story forever',async()=>{
 const neverResolves=async()=>new Promise(()=>{});
 const pool=photoPool(new Map(),neverResolves);
 pool.api.setStoryPhotoOwner('session-fer');
 const start=Date.now();
 const timeout=new Promise((_,reject)=>setTimeout(()=>reject(Error('Story was blocked on IndexedDB')),1100));
 const url=await Promise.race([
  pool.api.warmStoryPhoto(story('https://worker.example/api/stories/photo/still-valid')),timeout
 ]);
 assert.match(url,/^blob:/);
 assert.equal(pool.requests(),1,'remote signed grant becomes the fallback');
 assert.ok(Date.now()-start<1100,'cached-image lookup may never block the viewer');
});
