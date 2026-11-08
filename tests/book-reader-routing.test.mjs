import test from 'node:test';
import assert from 'node:assert/strict';
import {pwaReaderUrl,parsePwaReaderHash} from '../packages/shared/src/book-route.ts';

const id='1e4c9f89-04bf-42dc-9bdf-431b7ec01442';

test('3D BOOK deep links carry navigation only, never the musician session',()=>{
 const url=pwaReaderUrl({kind:'book'});
 const parsed=new URL(url);
 assert.equal(parsed.origin,'https://havana-nice-v2.pages.dev');
 assert.equal(parsed.pathname,'/');
 assert.equal(parsed.search,'');
 assert.equal(parsed.hash,'#reader=book');
 assert.deepEqual(parsePwaReaderHash(parsed.hash),{kind:'book'});
 assert.doesNotMatch(url,/token|session|authorization|bearer/i);
});

test('private Calendar memory deep links are strictly scoped to one UUID and no credentials',()=>{
 const url=pwaReaderUrl({kind:'memory',eventId:id.toUpperCase()});
 const parsed=new URL(url);
 assert.equal(parsed.search,'');
 assert.deepEqual(parsePwaReaderHash(parsed.hash),{kind:'memory',eventId:id});
 for(const value of [
  '#reader=memory&event=../../secret',
  '#reader=memory&event='+id+'&token=secret',
  '#reader=memory&event='+id+'&event='+id,
  '#reader=book&event='+id,
  '#reader=book&token=secret',
  '#reader=memory',
  '#reader=admin',
  '#reader=memory&event='+id.slice(0,20),
 ]){
  assert.equal(parsePwaReaderHash(value),null,value);
 }
 assert.throws(()=>pwaReaderUrl({kind:'memory',eventId:'not-uuid'}));
});
