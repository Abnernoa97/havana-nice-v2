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

const legacyBase=readFileSync(new URL('../apps/pwa/src/styles/admin/admin.css',import.meta.url),'utf8');
const legacySelectors=[
 'a-badge','a-warning','a-stats','a-stat','a-empty','a-actions','a-security',
 'a-eyebrow','a-health','a-health-main','a-health-dot','a-health-compact',
 'a-refresh','a-status-text','a-shortcuts','a-side-heading','a-module-next',
];
test('obsolete admin dashboard components have no CSS or live source consumers',()=>{
 for(const cls of legacySelectors){
  const exactClass=new RegExp('(^|[^a-zA-Z0-9_-])'+cls+'(?=$|[^a-zA-Z0-9_-])');
  const cssSelector=new RegExp('\\.'+cls+'(?=$|[^a-zA-Z0-9_-])');
  assert.doesNotMatch(legacyBase,cssSelector,'Dead selector remained in admin.css: '+cls);
  assert.doesNotMatch(css,cssSelector,'Dead selector remained in admin-editorial.css: '+cls);
  for(const path of allSourceFiles(fileURLToPath(new URL('../apps/pwa/src/',import.meta.url)))){
   assert.doesNotMatch(readFileSync(path,'utf8'),exactClass,'Retired dashboard class in '+path+': '+cls);
  }
 }
});
test('admin navigation remains identical without unused tab descriptions',()=>{
 const app=readFileSync(new URL('../apps/pwa/src/app/AdminApp.tsx',import.meta.url),'utf8');
 assert.match(app,/const tabs:\{id:WorkTab;name:string;icon:string\}\[\]=\[/);
 assert.equal((app.match(/^\s*\{id:'[^']+',name:/gm)||[]).length,8);
 assert.doesNotMatch(app,/description:'|description:string/);
 for(const live of ['a-panel','a-member-form','a-chat-general','a-member-rows']){
  assert.ok(legacyBase.includes('.'+live),'Active admin style lost: '+live);
 }
 assert.match(app,/AdminChatAccess section=\{tab==='home'\?'access':tab\}/);
});
