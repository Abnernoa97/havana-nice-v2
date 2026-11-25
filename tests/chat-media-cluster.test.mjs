import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const file=readFileSync(new URL('../packages/shared/src/chat-media-cluster.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const value={};runInNewContext(compiled,{exports:value,Date,Number});
const {groupChatMediaMessages}=value;
const make=(seq,actor='fer',kind='photo',offset=seq*10000)=>({
 seq,clientMessageId:'m'+seq,senderId:actor,senderName:actor,text:'',sentAt:new Date(1700000000000+offset).toISOString(),
 media:kind?{assetId:'a'+seq,kind,mimeType:kind==='video'?'video/mp4':'image/jpeg',sizeBytes:1,name:'x'}:null
});
test('A mixed batch and later consecutive photo remain one album',()=>{
 const messages=[...Array.from({length:12},(_,i)=>make(i+1,'fer',i%2?'video':'photo')),make(13,'fer','video',6000000)];
 const groups=groupChatMediaMessages(messages);
 assert.equal(groups.length,1);assert.equal(groups[0].length,13);
 assert.equal(groups[0][12],messages[12]);
});
test('Sender, text, audio, reply and deleted item break the gallery',()=>{
 const messages=[make(1),make(2,'noa'),make(3,'noa',null),make(4,'noa'),
  make(5,'noa','audio'),make(6,'noa'),{...make(7,'noa'),replyToSeq:1},
  make(8,'noa'),{...make(9,'noa'),deletedAt:Date.now()},make(10,'noa')];
 assert.equal(groupChatMediaMessages(messages).length,messages.length);
});

test('Member galleries have no outer frame or per-tile padding and preserve original selection',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const native=read('apps/android/styles/chat-styles.ts');
 const web=read('apps/pwa/src/styles/chat/chat.css');
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 const media=read('apps/android/features/chat/NativeChatMediaView.tsx');
 const photo=read('apps/android/features/chat/NativeChatPhoto.tsx');
 const video=read('apps/android/features/chat/NativeChatVideo.tsx');
 assert.doesNotMatch(native,/galleryCluster:\{[^}]*backgroundColor|galleryMine:\{[^}]*backgroundColor/);
 assert.match(native,/galleryBubble:\{[^}]*padding:0/);
 assert.match(native,/galleryGrid:\{[^}]*rowGap:3/);
 assert.match(timeline,/style=\{compact\?styles\.galleryBubble:/);
 assert.match(media,/compact\?\{width:'100%',aspectRatio:1\}/);
 assert.match(photo,/compact\?\{width:'100%',height:'100%',borderRadius:5\}/);
 assert.match(video,/compact\?\{width:'100%',height:'100%',borderRadius:5\}/);
 assert.doesNotMatch(web,/\.hn-chat-media-cluster(?:\.mine)?\{[^}]*background:/);
 assert.match(web,/\.hn-chat-media-cluster \.hn-chat-gallery-tile\{[^}]*padding:0/);
 for(const code of [timeline,read('apps/pwa/src/features/chat/ChatTimeline.tsx')]){
  assert.match(code,/selectChatGalleryMedia\(messages,/);
  assert.match(code,/delivery\(.*true\)/);
 }
});
