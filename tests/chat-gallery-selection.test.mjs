import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('packages/shared/src/chat-gallery-selection.ts');
const js=ts.transpileModule(source,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,
}}).outputText;
const exports={};
runInNewContext(js,{exports});
const {selectChatGalleryMedia}=exports;
function message(seq,kind='photo',senderId='fer',extra={}){
 return {seq,senderId,clientMessageId:'m'+seq,
  media:kind?{assetId:'a'+seq,kind,sizeBytes:12,mimeType:'image/jpeg',name:'file'}:null,
  ...extra};
}
test('gallery navigates every loaded photo/video across unrelated chat messages',()=>{
 const messages=[
  message(1),message(2,'video'),message(3,null),message(4,'audio'),
  message(5,'photo','noa'),message(6,'video','noa'),
  message(7,null),message(8,'photo','fer'),message(9,'video','fer')];
 const fromMiddle=selectChatGalleryMedia(messages,{senderId:'noa',clientMessageId:'m5',assetId:'a5'});
 assert.deepEqual(Array.from(fromMiddle.items,m=>m.assetId),['a1','a2','a5','a6','a8','a9']);
 assert.equal(fromMiddle.initial,2);
 const fromLater=selectChatGalleryMedia(messages,{senderId:'fer',clientMessageId:'m8',assetId:'a8'});
 assert.equal(fromLater.initial,4);
});
test('deleted messages are excluded; duplicates cannot select the wrong sender',()=>{
 const messages=[message(1),message(2,'video','fer',{deletedAt:1700000000}),message(3,'photo','noa')];
 assert.deepEqual(Array.from(selectChatGalleryMedia(messages,{senderId:'noa',clientMessageId:'m3',assetId:'a3'}).items,m=>m.assetId),['a1','a3']);
 assert.equal(selectChatGalleryMedia(messages,{senderId:'fer',clientMessageId:'m2',assetId:'a2'}),null);
 assert.equal(selectChatGalleryMedia(messages,{senderId:'fer',clientMessageId:'m3',assetId:'a3'}),null);
});
test('Android and PWA share the one gallery policy, not two independent implementations',()=>{
 const android=read('apps/android/features/chat/NativeChatTimeline.tsx');
 const pwa=read('apps/pwa/src/features/chat/ChatTimeline.tsx');
 const index=read('packages/shared/src/index.ts');
 const nativeViewer=read('apps/android/features/chat/NativeChatGallery.tsx');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 for(const timeline of [android,pwa]){
  assert.match(timeline,/selectChatGalleryMedia\(messages,/);
  assert.doesNotMatch(timeline,/conversationMedia|galleryItems/);
 }
 assert.match(index,/export \{selectChatGalleryMedia\} from '\.\/chat-gallery-selection';/);
 assert.doesNotMatch(css,/\.hn-gallery-prev|\.hn-gallery-next/);
 assert.doesNotMatch(nativeViewer,/\n (left|right|arrow):\{/);
 assert.doesNotMatch(index,/CHAT_MEDIA_CLUSTER_GAP_MS|CHAT_MEDIA_CLUSTER_LIMIT/);
});

test('Admin uses the same private multimedia gallery without a second media viewer',()=>{
 const admin=read('apps/pwa/src/features/chat/AdminChatGeneral.tsx');
 const gallery=read('apps/pwa/src/features/chat/ChatMediaGallery.tsx');
 const scopedCss=read('apps/pwa/src/features/chat/chat-media-gallery.css');
 const chatCss=read('apps/pwa/src/styles/chat/chat.css');
 assert.match(admin,/selectChatGalleryMedia\(messages,/);
 assert.match(admin,/<ChatMediaView media=\{m\.media\} token=\{token\}/);
 assert.match(admin,/onOpen=\{id=>/);
 assert.match(admin,/<ChatMediaGallery items=\{gallery\.items\} initial=\{gallery\.initial\}/);
 assert.match(admin,/adminDeleteChatMessage/);
 assert.match(gallery,/import '\.\/chat-media-gallery\.css'/);
 assert.match(scopedCss,/\.hn-gallery-overlay\{/);
 assert.match(scopedCss,/\.hn-gallery-photo-surface\{/);
 assert.doesNotMatch(chatCss,/\.hn-gallery-overlay\{|\.hn-gallery-photo-surface\{/);
});

test('Removed private fullscreen modal implementations cannot creep back into the chat',()=>{
 const inline=read('apps/pwa/src/features/chat/ChatMediaView.tsx');
 const hook=read('apps/pwa/src/features/chat/useChatMediaPreview.ts');
 const styles=read('apps/pwa/src/styles/chat/chat.css');
 const old=['ChatPhotoViewer.tsx','ChatVideoPlayer.tsx'];
 for(const name of old){
  assert.equal(existsSync(new URL('../apps/pwa/src/features/chat/'+name,import.meta.url)),false);
  assert.doesNotMatch(inline,new RegExp(name.replace('.tsx','')));
 }
 assert.doesNotMatch(inline,/photoOpen|videoOpen|videoRequest|videoGrant/);
 assert.doesNotMatch(hook,/videoGrant|videoRequest|setVisible/);
 assert.doesNotMatch(styles,/\.hn-photo-overlay|\.hn-chat-video-overlay/);
});
