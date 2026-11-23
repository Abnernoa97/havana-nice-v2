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
 media:kind?{assetId:'a'+seq,kind,mimeType:'image/jpeg',sizeBytes:1,name:'x'}:null
});
test('Adjacent mixed originals form one up-to-five media album without modifying the messages',()=>{
 const messages=[make(1),make(2,'fer','video'),make(3),make(4),make(5),make(6)];
 const groups=groupChatMediaMessages(messages);
 assert.equal(groups.length,2);
 assert.deepEqual(Array.from(groups,x=>x.length),[5,1]);
 assert.equal(groups[0][1],messages[1]);
});
test('Another sender, text, reply, deleted item or long interval breaks gallery',()=>{
 const messages=[make(1),make(2,'noa'),make(3,'noa',null),make(4,'noa'),{...make(5,'noa'),replyToSeq:1},make(6,'noa','video',6000000)];
 assert.equal(groupChatMediaMessages(messages).length,messages.length);
});
