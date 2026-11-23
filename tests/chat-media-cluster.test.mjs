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
