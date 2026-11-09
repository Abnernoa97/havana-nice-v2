import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getChatMenuState,getChatMessagePermissions,isWithinChatEditWindow,isWithinChatDeleteWindow,CHAT_EDIT_WINDOW_MS,CHAT_DELETE_WINDOW_MS} from '../packages/shared/src/chat-menu.ts';

const now=Date.parse('2026-11-07T12:00:00.000Z');
const own=(age)=>({senderId:'member:fer',sentAt:new Date(now-age).toISOString()});
const viewport={
 width:390,height:700,offsetTop:40,topPadding:10,bottomPadding:10,
 maxWidth:290,menuHeight:122,
};
const menu=(message,connection='en vivo',anchor=null,box=viewport)=>
 getChatMenuState(message,'member:fer',connection,anchor,box,now);

test('a single chat policy keeps the original 15-minute edit and 48-hour deletion limits',()=>{
 assert.equal(CHAT_EDIT_WINDOW_MS,900000);
 assert.equal(CHAT_DELETE_WINDOW_MS,172800000);
 assert.deepEqual([menu(own(0)).canEdit,menu(own(0)).canDelete],[true,true]);
 assert.deepEqual([menu(own(CHAT_EDIT_WINDOW_MS-1)).canEdit,menu(own(CHAT_EDIT_WINDOW_MS-1)).canDelete],[true,true]);
 assert.deepEqual([menu(own(CHAT_EDIT_WINDOW_MS)).canEdit,menu(own(CHAT_EDIT_WINDOW_MS)).canDelete],[false,true]);
 assert.deepEqual([menu(own(CHAT_DELETE_WINDOW_MS-1)).canEdit,menu(own(CHAT_DELETE_WINDOW_MS-1)).canDelete],[false,true]);
 assert.deepEqual([menu(own(CHAT_DELETE_WINDOW_MS)).canEdit,menu(own(CHAT_DELETE_WINDOW_MS)).canDelete],[false,false]);
});

test('direct edit and delete actions use identical shared window checks',()=>{
 assert.equal(isWithinChatEditWindow(own(CHAT_EDIT_WINDOW_MS-1).sentAt,now),true);
 assert.equal(isWithinChatEditWindow(own(CHAT_EDIT_WINDOW_MS).sentAt,now),false);
 assert.equal(isWithinChatDeleteWindow(own(CHAT_DELETE_WINDOW_MS-1).sentAt,now),true);
 assert.equal(isWithinChatDeleteWindow(own(CHAT_DELETE_WINDOW_MS).sentAt,now),false);
 const permissions=getChatMessagePermissions(own(1),'member:fer','en vivo',now);
 assert.deepEqual(permissions,{owned:true,canEdit:true,canDelete:true});
 assert.equal(getChatMessagePermissions(own(1),'member:fer','desconectado',now).canEdit,false);
});

test('offline, pending, missing and other-member messages can never be modified',()=>{
 for(const message of [
  null,
  {...own(1),pending:true},
  {...own(1),senderId:'member:noa'},
 ]){
  const state=menu(message);
  assert.equal(state.canEdit,false);
  assert.equal(state.canDelete,false);
 }
 for(const connection of ['desconectado','reconectando','sin conexión']){
  const state=menu(own(1),connection);
  assert.deepEqual([state.canEdit,state.canDelete],[false,false]);
 }
});

test('iPhone visual viewport preserves notch safe area and bubble-following behavior',()=>{
 const anchor={x:150,y:300,width:80,height:60};
 const ownMenu=menu(own(1),'en vivo',anchor);
 assert.equal(ownMenu.width,290);
 assert.equal(ownMenu.top,170);
 assert.equal(ownMenu.left,12);
 const other=menu({...own(1),senderId:'member:noa'},'en vivo',anchor);
 assert.equal(other.left,88);
 const center=menu(null);
 assert.equal(center.left,50);
 assert.equal(center.top,337);
 const topBubble=menu(own(1),'en vivo',{x:2,y:46,width:80,height:10});
 assert.ok(topBubble.top>=50,'notch offsets must keep the menu visible');
});

test('Android status bar, keyboard viewport and right-edge clamping remain unchanged',()=>{
 const native={
  width:360,height:640,offsetTop:0,topPadding:32,bottomPadding:14,
  maxWidth:288,menuHeight:118,
 };
 const anchor={x:300,y:20,width:52,height:40};
 const state=menu(own(1),'en vivo',anchor,native);
 assert.equal(state.width,288);
 assert.equal(state.top,68);
 assert.equal(state.left,60);
 const small={...native,height:240};
 const low=menu(own(1),'en vivo',{x:250,y:225,width:60,height:8},small);
 assert.ok(low.top<=240-118-14,'short-screen menu remains inside native viewport');
});

test('Chat context menus are independent render-only components, not another session or WebSocket',()=>{
 const pwa=readFileSync(new URL('../apps/pwa/src/features/chat/PwaChatMessageMenu.tsx',import.meta.url),'utf8');
 const android=readFileSync(new URL('../apps/android/features/chat/NativeChatMessageMenu.tsx',import.meta.url),'utf8');
 const webApp=readFileSync(new URL('../apps/pwa/src/app/App.tsx',import.meta.url),'utf8');
 const nativeApp=readFileSync(new URL('../apps/android/app/NativeApp.tsx',import.meta.url),'utf8');
 assert.match(webApp,/import PwaChatMessageMenu from/);
 assert.match(nativeApp,/import NativeChatMessageMenu from/);
  assert.ok(readFileSync(new URL('../apps/pwa/src/features/chat/SwipeMessage.tsx',import.meta.url),'utf8').includes('onSwipeRight()'));
  assert.ok(readFileSync(new URL('../apps/android/features/chat/SwipeableBubble.tsx',import.meta.url),'utf8').includes('callbacks.current.onReply()'));
 assert.match(webApp,/<PwaChatMessageMenu message=\{menuMessage\}/);
 assert.match(nativeApp,/<NativeChatMessageMenu message=\{menuMessage\}/);
 for(const src of [pwa,android]){
  assert.match(src,/onReact\(message,emoji\)/);
   assert.doesNotMatch(src,/Responder|onReply|onDelete|onEdit/);
   assert.ok(src.includes("['👍','❤️','😂']"));
  assert.doesNotMatch(src,/new WebSocket|startNamedChatSession|restoreNamedChatSession|getChatSnapshot|AsyncStorage|localStorage|fetch\(/);
 }
});
test('both frontends call the same helper, never duplicate message edit policy',()=>{
 const paths=['apps/pwa/src/app/App.tsx','apps/android/app/NativeApp.tsx'];
 for(const path of paths){
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  assert.match(source,/getChatMenuState\(/,path);
  assert.match(source,/getChatMessagePermissions\(message,session\?\.actorId,connection\)/,path);
  assert.match(source,/isWithinChatEditWindow\(editing\.sentAt\)/,path);
  assert.doesNotMatch(source,/const menuAge=|const menuOwn=|15\*60\*1000|48\*60\*60\*1000/,path+' must not keep private policy');
  assert.match(source,/canDelete|allowDelete/,path);
  assert.match(source,/canEdit|allowEdit/,path);
 }
 const shared=readFileSync(new URL('../packages/shared/src/index.ts',import.meta.url),'utf8');
 assert.match(shared,/export \{getChatMenuState,getChatMessagePermissions,isWithinChatEditWindow,isWithinChatDeleteWindow,CHAT_EDIT_WINDOW_MS,CHAT_DELETE_WINDOW_MS\} from '\.\/chat-menu'/);
});
