import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const compiled=ts.transpileModule(read('apps/pwa/src/features/stories/story-photo-pool.ts'),{
 fileName:'story-photo-pool.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
function photoPool(){
 const exports={},revoked=[];let requests=0,objects=0;
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
 runInNewContext(compiled,{exports,URL,Image,fetch,Date,Map,Set,Promise,Error});
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
