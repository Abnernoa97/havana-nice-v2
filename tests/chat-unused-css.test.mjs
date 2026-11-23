import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const css=readFileSync(new URL('../apps/pwa/src/styles/chat/chat.css',import.meta.url),'utf8');
function walk(folder){
 let list=[];
 for(const dirent of readdirSync(folder,{withFileTypes:true})){
  const path=join(folder,dirent.name);
  if(dirent.isDirectory())list.push(...walk(path));
  else if(/\.(ts|tsx|js|jsx|html)$/.test(dirent.name))list.push(path);
 }
 return list;
}
test('legacy video element CSS is unused, while actual video cards retain their frame',()=>{
 const pwa=walk(fileURLToPath(new URL('../apps/pwa/src/',import.meta.url)));
 const native=walk(fileURLToPath(new URL('../apps/android/features/',import.meta.url)));
 const obsolete=/(?:^|[^a-zA-Z0-9_-])hn-chat-video(?![-a-zA-Z0-9_])|hn-video-placeholder/;
 for(const file of [...pwa,...native]){
  const source=readFileSync(file,'utf8');
  assert.doesNotMatch(source,obsolete,'Obsolete player class still consumed: '+file);
 }
 assert.doesNotMatch(css,/\.hn-chat-video(?=[\s,{:]|$)|\.hn-video-placeholder/);
 assert.match(css,/\.hn-chat-video-cover\{width:100%;aspect-ratio:16\/9/);
 assert.match(css,/\.hn-chat-media\.is-tile \.hn-chat-video-cover\{height:100%;aspect-ratio:1/);
 assert.match(css,/\.hn-chat-video-poster\{/);
});
