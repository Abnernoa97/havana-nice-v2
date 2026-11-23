import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const css=readFileSync(new URL('../apps/pwa/src/styles/admin/admin-editorial.css',import.meta.url),'utf8');
const obsolete=[
 'hn-admin-brand','hn-admin-profile','hn-admin-profile-mark',
 'hn-admin-profile-label','hn-admin-shortcuts','hn-admin-shortcut-symbol',
];
function allSourceFiles(folder){
 const found=[];
 for(const dirent of readdirSync(folder,{withFileTypes:true})){
  const path=join(folder,dirent.name);
  if(dirent.isDirectory())found.push(...allSourceFiles(path));
  else if(/\.(ts|tsx|js|jsx|html)$/.test(dirent.name))found.push(path);
 }
 return found;
}
test('former Admin header and shortcut styles have no component consumers',()=>{
 for(const path of allSourceFiles(fileURLToPath(new URL('../apps/pwa/src/',import.meta.url)))){
  const src=readFileSync(path,'utf8');
  for(const token of obsolete){
   const pattern=new RegExp('(^|[^a-zA-Z0-9_-])'+token+'(?=$|[^a-zA-Z0-9_-])');
   assert.doesNotMatch(src,pattern,'Old Admin CSS class used: '+token+' in '+path);
  }
 }
 for(const token of obsolete)assert.doesNotMatch(css,new RegExp('\\.'+token+'(?=$|[^a-zA-Z0-9_-])'));
});
test('old Admin-only visual-brand selectors are gone without touching musician branding',()=>{
 const app=readFileSync(new URL('../apps/pwa/src/app/AdminApp.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(app,/className="visual-brand"|className="visual-subtitle"/);
 assert.doesNotMatch(css,/\.hn-admin-editorial \.a-header \.visual-brand\{/);
 assert.doesNotMatch(css,/\.hn-admin-editorial \.a-header \.visual-subtitle\{/);
});
test('new minimal Admin menu and active private panels retain their styles',()=>{
 const app=readFileSync(new URL('../apps/pwa/src/app/AdminApp.tsx',import.meta.url),'utf8');
 for(const selector of ['hn-admin-plain-menu','hn-admin-brand-button','hn-admin-minimal-header','hn-admin-auth-workspace']){
  assert.ok(css.includes('.'+selector),'Missing active Admin CSS '+selector);
  assert.ok(app.includes(selector),'Missing active Admin UI '+selector);
 }
 assert.match(css,/\.hn-admin-editorial \.a-family-book\{/);
 assert.match(css,/\.hn-admin-editorial \.a-chat-general\{/);
});
