import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
const src=readFileSync(new URL('../apps/pwa/src/services/private-image-cache.ts',import.meta.url),'utf8');
const code=ts.transpileModule(src,{fileName:'private-image-cache.ts',
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function simulatedSafari(){
 const persisted=new Map();
 const queueRequest=result=>{
  const req={result,onsuccess:null,onerror:null};
  queueMicrotask(()=>req.onsuccess?.());
  return req;
 };
 const db={
  transaction:()=>({objectStore:()=>({
   get:key=>queueRequest(persisted.get(key)),
   put:row=>{persisted.set(row.id,row);return queueRequest(row.id);},
   delete:key=>{persisted.delete(key);return queueRequest(undefined);},
   getAll:()=>queueRequest([...persisted.values()]),
   getAllKeys:()=>queueRequest([...persisted.keys()]),
  })}),
 };
 const indexedDB={open:()=>queueRequest(db)};
 const load=()=>{
  const exports={};
  runInNewContext(code,{exports,indexedDB,crypto:webcrypto,Blob,TextEncoder,Uint8Array,
   Date,Promise,Map,Array,Error,Number});
  return exports;
 };
 return {load,persisted};
}
test('actual AES-GCM encrypted image survives PWA process restart without private URLs or tokens',async()=>{
 const p=simulatedSafari();
 const first=p.load();
 const blob=new Blob(['JPEG-test-bytes-FER'],{type:'image/jpeg'});
 await first.storePrivateImage('session-fer','family-thumb:abc',blob,Date.now()+60_000);
 assert.equal(p.persisted.size,1);
 const [row]=[...p.persisted.values()];
 assert.ok(!row.id.includes('session-fer'),'the session token is not an IndexedDB key');
 assert.ok(!Buffer.from(row.payload).includes(Buffer.from('JPEG-test-bytes-FER')),'raw photo bytes are never saved');
 assert.equal(row.mime,'image/jpeg');
 assert.equal(row.iv.length,12);
 const restarted=p.load();
 const cached=await restarted.readPrivateImage('session-fer','family-thumb:abc');
 assert.equal(await cached?.text(),'JPEG-test-bytes-FER');
 assert.equal(await restarted.readPrivateImage('session-noa','family-thumb:abc'),null);
});
test('logout purges private encrypted entries, even after reopening Safari',async()=>{
 const p=simulatedSafari(),first=p.load();
 await first.storePrivateImage('session-fer','profile:fer',
  new Blob(['avatar'],{type:'image/jpeg'}),Date.now()+60_000);
 const restarted=p.load();
 await restarted.clearPrivateImagesForToken('session-fer');
 assert.equal(p.persisted.size,0);
 assert.equal(await restarted.readPrivateImage('session-fer','profile:fer'),null);
});
test('expired encrypted thumbnails are rejected instead of showing private stale photos',async()=>{
 const p=simulatedSafari(),first=p.load();
 await first.storePrivateImage('session-fer','story:expired',
  new Blob(['expired'],{type:'image/jpeg'}),Date.now()+60_000);
 const entry=[...p.persisted.values()][0];
 entry.expiresAt=Date.now()-1;
 const restarted=p.load();
 assert.equal(await restarted.readPrivateImage('session-fer','story:expired'),null);
});
