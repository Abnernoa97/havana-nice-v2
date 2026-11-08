// Tests the actual cross-platform media batch implementation; no R2 or
// network write. Native and PWA keep their own transport and original files.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const src=readFileSync(new URL('../packages/shared/src/chat-media-batch.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(src,{fileName:'chat-media-batch.ts',
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exported={};
runInNewContext(compiled,{exports:exported,Math,Number,Promise});
const {uploadChatMediaBatch}=exported;

test('one shared batch processes native and PWA original-byte progress in order',async()=>{
 const files=[{id:'one',size:100},{id:'two',size:300}];
 const result=[],progress=[];
 await uploadChatMediaBatch(files,{
  sizeOf:item=>item.size,
  upload:async(item,onSent)=>{
   onSent(item.size/2);
   onSent(item.size);
  },
  confirmed:item=>result.push(item.id),
  progress:p=>progress.push(p)
 });
 assert.deepEqual(result,['one','two']);
 assert.ok(progress.includes(13)&&progress.includes(25));
 assert.equal(progress.at(-1),100);
 assert.ok(progress.every(p=>p>=0&&p<=100));
});
test('failing second upload keeps its original identity and does not confirm it',async()=>{
 const files=[{id:'first',size:100},{id:'second',size:500}];
 const confirmed=[],progress=[];
 await assert.rejects(uploadChatMediaBatch(files,{
  sizeOf:item=>item.size,
  upload:async(item,onSent)=>{
   onSent(item.size/2);
   if(item.id==='second')throw Error('network interrupted');
   onSent(item.size);
  },
  confirmed:item=>confirmed.push(item),
  progress:p=>progress.push(p)
 }),/network interrupted/);
 assert.equal(confirmed.length,1);
 assert.equal(confirmed[0],files[0]);
 assert.ok(progress.at(-1)<100);
 const retried=[];
 await uploadChatMediaBatch(files.slice(1),{
  sizeOf:item=>item.size,
  upload:async(item,notify)=>{notify(item.size);},
  confirmed:item=>retried.push(item),
  progress:()=>{}
 });
 assert.equal(retried[0],files[1],'Retry must retain original file object');
});
test('reported progress is clamped to uploaded bytes, with no negative or oversize values',async()=>{
 const values=[];
 await uploadChatMediaBatch([{size:10}],{
  sizeOf:x=>x.size,
  upload:async(_item,notify)=>{notify(-3);notify(Infinity);notify(800);},
  confirmed:()=>{},
  progress:p=>values.push(p)
 });
 assert.deepEqual(values,[0,0,100,100]);
});
