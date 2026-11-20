import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('PWA access panel owns only presentation, not session or backend',()=>{
  const app=read('apps/pwa/src/app/App.tsx');
  const panel=read('apps/pwa/src/features/chat/PwaMemberAccessPanel.tsx');
  assert.match(app,/const \[session, setSession\] = useState<ChatSession \| null>\(null\)/);
  assert.match(app,/startNamedChatSession\(name\.trim\(\)\)/);
  assert.match(app,/restoreNamedChatSession/);
  assert.match(app,/const socket = useRef<WebSocket \| null>\(null\)/);
  assert.match(app,/<PwaMemberAccessPanel/);
  assert.doesNotMatch(app,/ACCESO HAVANA NICE/);
  assert.match(panel,/mode:'restoring'\|'reader-denied'\|'join'/);
  assert.match(panel,/onNameChange:\(value:string\)=>void/);
  assert.match(panel,/onJoin:\(\)=>void/);
  assert.match(panel,/form onSubmit=\{event=>\{event\.preventDefault\(\);onJoin\(\);\}\}/);
  assert.doesNotMatch(panel,/startNamedChatSession|restoreNamedChatSession|new WebSocket|setSession|localStorage|fetch\(/);
});

test('PWA keeps unauthorized reader, pending entry and approved Chat behavior',()=>{
  const app=read('apps/pwa/src/app/App.tsx');
  const panel=read('apps/pwa/src/features/chat/PwaMemberAccessPanel.tsx');
  assert.match(app,/restoringAccess \|\| !session \? \(/);
  assert.match(app,/readerRoute\?'reader-denied':'join'/);
  assert.match(app,/onNameChange=\{setName\}/);
  assert.match(app,/onJoin=\{\(\)=>\{void join\(\);\}\}/);
  assert.match(app,/<ChatTimeline messages=\{messages\}/);
  assert.match(panel,/disabled=\{joining\|\|!name\.trim\(\)\}/);
  assert.match(panel,/onCloseReader/);
  assert.match(panel,/Tu nombre/);
});
