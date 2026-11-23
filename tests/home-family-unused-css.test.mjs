import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const home=readFileSync(new URL('../apps/pwa/src/styles/home/home.css',import.meta.url),'utf8');
const stage=readFileSync(new URL('../apps/pwa/src/features/home/home-stage.css',import.meta.url),'utf8');
const obsolete=['hn-family-toolbar','hn-family-intro','hn-family-book','hn-family-book-reader','hn-family-book-eyebrow','hn-family-book-info','hn-family-book-rule','hn-moment-story-pending'];
function walk(folder){
 const out=[];
 for(const entry of readdirSync(folder,{withFileTypes:true})){
  const path=join(folder,entry.name);
  if(entry.isDirectory())out.push(...walk(path));
  else if(/\.(ts|tsx|js|jsx|html)$/.test(entry.name))out.push(path);
 }
 return out;
}
test('HOME and Familia source no longer consumes obsolete classes',()=>{
 const pwa=fileURLToPath(new URL('../apps/pwa/src/',import.meta.url));
 for(const file of walk(pwa)){
  const source=readFileSync(file,'utf8');
  for(const cls of obsolete){
   const pattern=new RegExp('(^|[^a-zA-Z0-9_-])'+cls+'(?=$|[^a-zA-Z0-9_-])');
   assert.doesNotMatch(source,pattern,cls+' still used by '+file);
  }
 }
 for(const cls of obsolete){
  assert.doesNotMatch(home+stage,new RegExp('\\.'+cls+'(?=$|[^a-zA-Z0-9_-])'));
 }
});
test('approved HOME, Familia and BOOK 3D classes are preserved',()=>{
 for(const cls of ['hn-family-album','hn-family-cover','hn-family-inline-book'])
  assert.ok(home.includes('.'+cls),'Missing Familia selector '+cls);
 for(const cls of ['hn-home-stage','hn-moment-circle','hn-moment-count','hn-moment-photo'])
  assert.ok(stage.includes('.'+cls),'Missing HOME selector '+cls);
 assert.match(home,/\.hn-family-album:focus-visible\{outline:3px solid/);
 assert.match(stage,/\.hn-home-route \.hn-home-audio-scroll\{/);
});
