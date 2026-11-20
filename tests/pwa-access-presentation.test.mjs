import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('PWA app entry delegates UI and retains exactly one session/transport owner',()=>{
  const app=read('apps/pwa/src/app/App.tsx');
  const controller=read('apps/pwa/src/features/chat/usePwaChatController.ts');
  const surface=read('apps/pwa/src/features/chat/PwaChatSurface.tsx');
  const panel=read('apps/pwa/src/features/chat/PwaMemberAccessPanel.tsx');
  assert.match(app,/usePwaChatController\(\)/);
  assert.match(app,/<PwaChatSurface ui=\{ui\}\/>/);
  assert.doesNotMatch(app,/useState|new WebSocket|startNamedChatSession|saveLocalChat/);
  assert.match(controller,/const \[session, setSession\] = useState<ChatSession \| null>\(null\)/);
  assert.match(controller,/startNamedChatSession\(name\.trim\(\)\)/);
  assert.match(controller,/restoreNamedChatSession/);
  assert.match(controller,/const socket = useRef<WebSocket \| null>\(null\)/);
  assert.match(surface,/<PwaMemberAccessPanel/);
  assert.doesNotMatch(surface,/startNamedChatSession|restoreNamedChatSession|openChatSocket|saveLocalChat|new WebSocket/);
  assert.doesNotMatch(panel,/startNamedChatSession|restoreNamedChatSession|new WebSocket|setSession|localStorage|fetch\(/);
});

test('PWA access UI retains existing reader denial, pending login and approved Chat actions',()=>{
  const surface=read('apps/pwa/src/features/chat/PwaChatSurface.tsx');
  const panel=read('apps/pwa/src/features/chat/PwaMemberAccessPanel.tsx');
  assert.match(surface,/restoringAccess \|\| !session \? \(/);
  assert.match(surface,/readerRoute\?'reader-denied':'join'/);
  assert.match(surface,/onNameChange=\{setName\}/);
  assert.match(surface,/onJoin=\{\(\)=>\{void join\(\);\}\}/);
  assert.match(surface,/<ChatTimeline messages=\{messages\}/);
  assert.match(panel,/mode:'restoring'\|'reader-denied'\|'join'/);
  assert.match(panel,/onNameChange:\(value:string\)=>void/);
  assert.match(panel,/onJoin:\(\)=>void/);
  assert.match(panel,/form onSubmit=\{event=>\{event\.preventDefault\(\);onJoin\(\);\}\}/);
  assert.match(panel,/disabled=\{joining\|\|!name\.trim\(\)\}/);
  assert.match(panel,/onCloseReader/);
  assert.match(panel,/Tu nombre/);
});
