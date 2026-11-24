import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const compiled=ts.transpileModule(read('packages/shared/src/chat-menu.ts'),{
 fileName:'chat-menu.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const shared={};
runInNewContext(compiled,{exports:shared,Date,Math});
test('Chat reply/context actions only accept confirmed, undeleted messages',()=>{
 const accept=shared.isActionableChatMessage;
 assert.equal(accept({seq:1,deletedAt:null}),true);
 assert.equal(accept({seq:342,deletedAt:undefined}),true);
 assert.equal(accept({seq:0,deletedAt:null}),false);
 assert.equal(accept({seq:-1,deletedAt:null}),false);
 assert.equal(accept({seq:5,deletedAt:'2026-11-23T10:00:00Z'}),false);
});
test('both Chat controllers use the same pure gate, retaining socket and access ownership',()=>{
 const index=read('packages/shared/src/index.ts');
 assert.match(index,/export \{isActionableChatMessage\} from '\.\/chat-menu'/);
 for(const path of ['apps/android/features/chat/useNativeChatController.ts','apps/pwa/src/features/chat/usePwaChatController.ts']){
  const code=read(path);
  assert.match(code,/function replyToMessage\(message:ChatMessage\)[\s\S]*?if\(!isActionableChatMessage\(message\)\)return/);
  assert.match(code,/function showMessageMenu\(message:ChatMessage,anchor:[\w]+\)[\s\S]*?if\(!isActionableChatMessage\(message\)\)return/);
  assert.equal((code.match(/if\(!isActionableChatMessage\(message\)\)return;/g)||[]).length,2);
  assert.match(code,/const socket = useRef<WebSocket \| null>\(null\)/);
  assert.match(code,/const activeSession = useRef<ChatSession \| null>\(null\)/);
  assert.match(code,/new ChatConnectionTimers\(\)/);
  assert.doesNotMatch(code,/function (?:replyToMessage|showMessageMenu)[\s\S]{0,250}new WebSocket/);
 }
});
