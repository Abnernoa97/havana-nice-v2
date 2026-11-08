import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const manifestPath=new URL('../apps/pwa/dist/.vite/manifest.json',import.meta.url);
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const entries=Object.entries(manifest);
function nodeFor(suffix){
 const found=entries.filter(([key,value])=>key.endsWith(suffix)||
  (typeof value.src==='string'&&value.src.endsWith(suffix)));
 assert.equal(found.length,1,'Expected exactly one Vite chunk for '+suffix);
 return found[0];
}
function staticClosure(root){
 const seen=new Set(),queue=[root];
 while(queue.length){
  const key=queue.shift();
  if(seen.has(key))continue;
  seen.add(key);
  const next=manifest[key];
  assert.ok(next,'Missing compiled import manifest node '+key);
  for(const ref of next.imports||[])queue.push(ref);
 }
 return seen;
}
function dynamicReachable(root,target){
 const seen=new Set(),queue=[root];
 while(queue.length){
  const name=queue.shift();
  if(seen.has(name))continue;
  seen.add(name);
  for(const ref of [...(manifest[name]?.imports||[]),...(manifest[name]?.dynamicImports||[])])
   queue.push(ref);
 }
 return seen.has(target);
}
const home=nodeFor('src/app/VisualApp.tsx');
const member=[
 'src/features/calendar/CalendarAccordion.tsx',
 'src/features/repertoire/MemberRepertoire.tsx',
 'src/features/family/MemberFamily.tsx'
];
const admin=[
 'src/features/chat/AdminChatGeneral.tsx',
 'src/features/calendar/AdminCalendar.tsx',
 'src/features/repertoire/AdminRepertoire.tsx',
 'src/features/family/AdminFamily.tsx'
];
test('main Chat bootstrap downloads no Calendar, Repertoire, Family or HOME feature bundle',()=>{
 const [key]=nodeFor('index.html');
 const initial=staticClosure(key);
 assert.equal(initial.has(home[0]),false,'HOME must not be eager inside Chat bootstrap');
 assert.equal(dynamicReachable(key,home[0]),true,'Authorized HOME must remain reachable');
 for(const item of member){
  const [key,chunk]=nodeFor(item);
  assert.equal(chunk.isDynamicEntry,true,item+' must compile as a lazy chunk');
  assert.equal(initial.has(key),false,item+' leaked into initial Chat JS');
  assert.equal(dynamicReachable(home[0],key),true,item+' must open from HOME');
 }
});
test('visual preview has lightweight shell but does not eagerly download member features',()=>{
 const [entry]=nodeFor('visual.html');
 const initial=staticClosure(entry);
 assert.equal(initial.has(home[0]),true,'Visual shell must still render normally');
 for(const path of member)assert.equal(initial.has(nodeFor(path)[0]),false,path+' eagerly loaded in preview');
});
test('Admin access remains mounted while Chat, Calendar, Repertoire and Family download on selection',()=>{
 const [entry]=nodeFor('admin.html');
 const initial=staticClosure(entry);
 for(const path of admin){
  const [key,chunk]=nodeFor(path);
  assert.equal(chunk.isDynamicEntry,true,path+' must be lazy');
  assert.equal(initial.has(key),false,path+' incorrectly included in Admin login bootstrap');
  assert.equal(dynamicReachable(entry,key),true,path+' no longer reachable from Admin');
 }
});
test('No extra session owner, HTML page controller, duplicate Worker or new React root was introduced',()=>{
 const memberShell=source('apps/pwa/src/app/App.tsx');
 const visual=source('apps/pwa/src/app/VisualApp.tsx');
 const adminShell=source('apps/pwa/src/features/admin/AdminChatAccess.tsx');
 assert.match(memberShell,/restoreNamedChatSession/);
 assert.match(memberShell,/const VisualApp=lazy\(\(\)=>import\('\.\/VisualApp'\)\)/);
 assert.match(memberShell,/session&&activeScreen!=='chat'&&<Suspense/);
 for(const name of ['CalendarAccordion','MemberRepertoire','MemberFamily'])
  assert.match(visual,new RegExp('const '+name+'=lazy\\('));
 for(const name of ['AdminCalendar','AdminRepertoire','AdminFamily','AdminChatGeneral'])
  assert.match(adminShell,new RegExp('const '+name+'=lazy\\('));
 for(const file of ['apps/pwa/src/app/VisualApp.tsx','apps/pwa/src/features/admin/AdminChatAccess.tsx'])
  assert.doesNotMatch(source(file),/startNamedChatSession|restoreNamedChatSession|createRoot\(|new WebSocket\(/);
 assert.equal(entries.filter(([,value])=>value.isEntry).length,4,'Exactly four historic HTML entries: app, visual, admin, BOOK');
});
console.log('V2 PWA bundle isolation: source graph and compiled entry boundaries checked');
