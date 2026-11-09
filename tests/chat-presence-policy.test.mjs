import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chatReactionPayload,chatTypingPayload,CHAT_TYPING_THROTTLE_MS}
 from '../packages/shared/src/chat-presence.ts';

test('reaction retains server message shape and ignores unconfirmed seq',()=>{
 assert.equal(chatReactionPayload(0,'❤️'),null);
 assert.equal(chatReactionPayload(-1,'😂'),null);
 assert.deepEqual(JSON.parse(chatReactionPayload(3,'👍')),{type:'chat.react',messageSeq:3,emoji:'👍'});
});
test('typing retains 1700ms edge and trimmed inactive draft',()=>{
 assert.equal(CHAT_TYPING_THROTTLE_MS,1700);
 assert.equal(chatTypingPayload('hola',1700,0),null);
 assert.deepEqual(JSON.parse(chatTypingPayload('hola',1701,0)),{type:'chat.typing',active:true});
 assert.deepEqual(JSON.parse(chatTypingPayload('   ',3702,1701)),{type:'chat.typing',active:false});
});
test('one pure policy, while each platform retains its WebSocket owner',()=>{
 const shared=readFileSync(new URL('../packages/shared/src/chat-presence.ts',import.meta.url),'utf8');
 assert.doesNotMatch(shared,/new WebSocket|\.send\(|localStorage|AsyncStorage|setTimeout|useEffect/);
 for(const p of ['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx']){
  const src=readFileSync(new URL('../'+p,import.meta.url),'utf8');
  assert.match(src,/chatReactionPayload\(seq,emoji\)/,p);
  assert.match(src,/chatTypingPayload\(value,now,typingLast\.current\)/,p);
  assert.match(src,/socket\.current\?\.readyState===WebSocket\.OPEN/,p);
  assert.doesNotMatch(src,/JSON\.stringify\(\{type:'chat\.typing'/,p);
  assert.doesNotMatch(src,/JSON\.stringify\(\{type:'chat\.react'/,p);
 }
});
