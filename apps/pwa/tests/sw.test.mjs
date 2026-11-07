import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://havana-nice-v2-dev.pages.dev';

function serviceWorkerHarness(fetchImpl = async () => ({ok:true,type:'basic',clone(){return this;}})) {
  const handlers = {};
  const writes = [];
  const removed = [];
  const assetRemoved = [];
  const existingCaches = new Map();
  const caches = {
    async open(name) {
      return {
        async addAll(keys) { for (const key of keys) existingCaches.set(key, {type:'basic',ok:true}); },
        async put(key, value) { writes.push({name,key,value});existingCaches.set(typeof key==='string'?key:key.url,value); },
        async keys() {return [...existingCaches.keys()].map(key=>({url:new URL(key,ORIGIN).toString()}));},
        async delete(key) {
          const uri=typeof key==='string'?key:key.url;
          assetRemoved.push(uri);return existingCaches.delete(uri);
        },
      };
    },
    async keys() {return ['havana-nice-v2-foundation-v1','unrelated-app-cache'];},
    async delete(key) {removed.push(key);return true;},
    async match(key) {return existingCaches.get(typeof key==='string'?key:key.url)||null;},
  };
  const self = {
    location:{origin:ORIGIN},
    addEventListener(name,cb){handlers[name]=cb;},
    skipWaiting(){},
    clients:{claim(){}},
  };
  runInNewContext(script,{self,caches,URL,fetch:fetchImpl,Response});
  async function dispatch(req) {
    const pending=[];
    let responded;
    const event={
      request:{
        method:req.method||'GET',
        url:req.url||ORIGIN+'/',
        mode:req.mode||'cors',
        headers:{has:(key)=>req.authorization===true&&key==='authorization'},
      },
      waitUntil(p){pending.push(p);},
      respondWith(p){responded=p;},
    };
    handlers.fetch(event);
    const result=responded?await responded:undefined;
    await Promise.all(pending);
    return {handled:Boolean(responded),result};
  }
  return {dispatch,writes,removed,assetRemoved,handlers,caches};
}

test('never intercept chat API even on same origin',async()=>{
  const sw=serviceWorkerHarness();
  const r=await sw.dispatch({url:ORIGIN+'/api/chat/messages'});
  assert.equal(r.handled,false);
  assert.equal(sw.writes.length,0);
});

test('never intercept cross-origin Worker APIs or requests bearing credentials',async()=>{
  const sw=serviceWorkerHarness();
  const a=await sw.dispatch({url:'https://havana-nice-v2-dev.soloaplicaciones97.workers.dev/api/chat/session'});
  const b=await sw.dispatch({url:ORIGIN+'/assets/app.js',authorization:true});
  const c=await sw.dispatch({url:ORIGIN+'/assets/app.js',method:'POST'});
  assert.equal(a.handled,false);
  assert.equal(b.handled,false);
  assert.equal(c.handled,false);
  assert.equal(sw.writes.length,0);
});

test('cache only approved same-origin application assets',async()=>{
  const sw=serviceWorkerHarness();
  const a=await sw.dispatch({url:ORIGIN+'/assets/index.abc.js'});
  const b=await sw.dispatch({url:ORIGIN+'/icons/havana-nice-192.png'});
  const c=await sw.dispatch({url:ORIGIN+'/',mode:'navigate'});
  assert.equal(a.handled,true);
  assert.equal(b.handled,true);
  assert.equal(c.handled,true);
  assert.equal(sw.writes.length,3);
  assert.equal(sw.writes[2].key,'/');
});

test('many deployments retain only the newest 40 static assets, not unlimited hashes',async()=>{
 const sw=serviceWorkerHarness();
 for(let i=0;i<45;i++){
  const path='/assets/index-'+String(i).padStart(2,'0')+'.js';
  await sw.dispatch({url:ORIGIN+path});
 }
 const cache=await sw.caches.open('havana-nice-v2-static-v4');
 const latest=await cache.keys();
 const assets=latest.filter(x=>x.url.includes('/assets/'));
 assert.equal(assets.length,40);
 assert.equal(sw.assetRemoved.length,5);
 assert.ok(sw.assetRemoved.every(x=>x.startsWith(ORIGIN+'/assets/index-')));
 assert.equal(await sw.caches.match(ORIGIN+'/assets/index-00.js'),null);
 assert.ok(await sw.caches.match(ORIGIN+'/assets/index-44.js'));
 // Static caching must not intercept a private API even after pruning.
 assert.equal((await sw.dispatch({url:ORIGIN+'/api/chat/messages'})).handled,false);
});

test('replace old V2 caches without deleting unrelated app caches',async()=>{
  const sw=serviceWorkerHarness();
  const pending=[];
  sw.handlers.activate({waitUntil(p){pending.push(p);}});
  await Promise.all(pending);
  assert.deepEqual(sw.removed,['havana-nice-v2-foundation-v1']);
});

test('offline navigation falls back only to the static app shell',async()=>{
  const sw=serviceWorkerHarness(async()=>{throw Error('offline');});
  await sw.caches.open('havana-nice-v2-static-v2').then(c=>c.addAll(['/']));
  const a=await sw.dispatch({url:ORIGIN+'/chat',mode:'navigate'});
  assert.equal(a.handled,true);
  assert.equal(a.result.ok,true);
  const b=await sw.dispatch({url:ORIGIN+'/api/chat/messages'});
  assert.equal(b.handled,false);
});

test('separate visual WebView shell never falls back to Chat HTML while offline',async()=>{
  const sw=serviceWorkerHarness(async()=>{throw Error('offline');});
  const cache=await sw.caches.open('havana-nice-v2-static-v4');
  await cache.addAll(['/','/visual.html']);
  const result=await sw.dispatch({url:ORIGIN+'/visual.html',mode:'navigate'});
  assert.equal(result.handled,true);
  assert.equal(result.result.ok,true);
  assert.equal(sw.writes.length,0);
});

test('installed Administrator HTML is never cached or intercepted, including offline',async()=>{
 const sw=serviceWorkerHarness(async()=>{throw Error('offline');});
 const res=await sw.dispatch({url:ORIGIN+'/admin.html',mode:'navigate'});
 assert.equal(res.handled,false);
 assert.equal(sw.writes.length,0);
});
test('Administrator manifest is public static data and cache eligible',async()=>{
 const sw=serviceWorkerHarness();
 const res=await sw.dispatch({url:ORIGIN+'/admin.webmanifest'});
 assert.equal(res.handled,true);
 assert.equal(sw.writes.length,1);
});
