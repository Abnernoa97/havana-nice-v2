import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const src=readFileSync(new URL('../packages/shared/src/repertoire.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(src,{
 fileName:'repertoire.ts',
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
function runRepertoire(fetchImpl){
 const exports={};
 runInNewContext(compiled,{
  exports,fetch:fetchImpl,URL,Error,Promise,
  require(id){
   assert.equal(id,'./api-base');
   return {HAVANA_V2_DEV_API_BASE_URL:'https://calendar.example.test'};
  },
 });
 return exports;
}
const response=(data,ok=true)=>({ok,json:async()=>data});

test('catalog pagination keeps every item and original Admin/member routes',async()=>{
 for(const admin of [true,false]){
  const calls=[];
  const api=runRepertoire(async(url,options)=>{
   calls.push({url,options});
   const offset=new URL(url).searchParams.get('offset');
   return response({songs:[{id:'song-'+offset}],hasMore:offset==='0'});
  });
  const songs=await api.getRepertoireSongs('member-token',admin);
  assert.deepEqual([...songs].map(s=>s.id),['song-0','song-250']);
  const prefix=admin?'/api/repertoire/admin/songs':'/api/repertoire/songs';
  assert.deepEqual(calls.map(c=>new URL(c.url).pathname+new URL(c.url).search),
   [prefix+'?offset=0',prefix+'?offset=250']);
  for(const call of calls){
   assert.equal(call.options.headers.Authorization,'Bearer member-token');
   assert.equal(call.options.headers.Accept,'application/json');
   assert.equal(call.options.cache,'no-store');
  }
 }
});
test('assigned event songs keep their separate path, array key and stable order',async()=>{
 const urls=[];
 const api=runRepertoire(async(url)=>{
  urls.push(url);
  const offset=new URL(url).searchParams.get('offset');
  return response({items:[{id:'item-'+offset}],hasMore:offset==='0'});
 });
 const items=await api.getAssignedEventRepertoire('musician-token');
 assert.deepEqual([...items].map(s=>s.id),['item-0','item-250']);
 assert.deepEqual(urls.map(x=>new URL(x).pathname+new URL(x).search),[
  '/api/repertoire/events/assigned?offset=0',
  '/api/repertoire/events/assigned?offset=250',
 ]);
});
test('pagination stops at the original 10000 offset, then reports the same error',async()=>{
 const offsets=[];
 const api=runRepertoire(async(url)=>{
  offsets.push(new URL(url).searchParams.get('offset'));
  return response({items:[],songs:[],hasMore:true});
 });
 await assert.rejects(api.getRepertoireSongs('member'),/Hay demasiadas canciones. Contacta al Administrador./);
 assert.equal(offsets.length,41);
 assert.deepEqual(offsets.slice(0,2),['0','250']);
 assert.equal(offsets.at(-1),'10000');
 offsets.length=0;
 await assert.rejects(api.getAssignedEventRepertoire('member'),/Demasiadas canciones por evento. Contacta al Administrador./);
 assert.equal(offsets.length,41);
 assert.equal(offsets.at(-1),'10000');
});
test('server error is not swallowed, and a single event query remains unchanged',async()=>{
 const fail=runRepertoire(async()=>response({error:'Credenciales vencidas'},false));
 await assert.rejects(fail.getRepertoireSongs('member'),/Credenciales vencidas/);
 const paths=[];
 const ok=runRepertoire(async url=>{
  paths.push(new URL(url).pathname);
  return response({items:[{id:'special'}]});
 });
 const items=await ok.getEventRepertoire('member','fecha con / acento ñ');
 assert.deepEqual([...items].map(x=>x.id),['special']);
 assert.deepEqual(paths,['/api/repertoire/events/fecha%20con%20%2F%20acento%20%C3%B1/items']);
});
test('all paginated readers use one private implementation',()=>{
 assert.equal((src.match(/for\(let offset=0;offset<=10000;offset\+=250\)/g)||[]).length,1);
 assert.match(src,/return readPages<RepertoireSong,'songs'>/);
 assert.match(src,/return readPages<RepertoireEventItem,'items'>/);
});
