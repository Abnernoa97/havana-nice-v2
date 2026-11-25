import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transferNativeVoice} from '../apps/android/features/chat/native-voice-transfer.ts';
const id='00000000-0000-4000-8000-000000000001';
const ready={id,ready:true,multipart:false};
test('Voice uploads once then confirms server seq',async()=>{
 const calls=[];
 const result=await transferNativeVoice(id,{start:async()=>{calls.push('start');return {...ready,ready:false};},put:async()=>{calls.push('put');},send:async()=>{calls.push('send');return {seq:9};}});
 assert.deepEqual(result,{id,seq:9});assert.deepEqual(calls,['start','put','send']);
});
test('Retry of an already uploaded voice skips bytes and reuses same UUID',async()=>{
 const result=await transferNativeVoice(id,{start:async()=>ready,put:async()=>assert.fail('duplicate upload'),send:async()=>({seq:9})});
 assert.deepEqual(result,{id,seq:9});
});
test('Hung upload aborts at deadline; late completion cannot publish',async()=>{
 let signal,resolve,sends=0;
 const task=transferNativeVoice(id,{start:async()=>({...ready,ready:false}),put:s=>{signal=s;return new Promise(r=>{resolve=r;});},send:async()=>{sends++;return {seq:9};}},20);
 await assert.rejects(task,/tardó demasiado/);assert.equal(signal.aborted,true);resolve();await new Promise(r=>setImmediate(r));assert.equal(sends,0);
});
test('Session cancellation prevents late send',async()=>{
 const owner=new AbortController();let resolve;
 const task=transferNativeVoice(id,{start:()=>new Promise(r=>{resolve=r;}),put:async()=>assert.fail(),send:async()=>assert.fail()},500,owner.signal);
 owner.abort();await assert.rejects(task,/acceso cambió/);resolve(ready);
});
test('Reject mismatched UUID and unconfirmed seq',async()=>{
 await assert.rejects(transferNativeVoice(id,{start:async()=>({...ready,id:'wrong'}),put:async()=>assert.fail(),send:async()=>assert.fail()}),/no coincide/);
 await assert.rejects(transferNativeVoice(id,{start:async()=>ready,put:async()=>assert.fail(),send:async()=>({seq:0})}),/confirmar/);
});

test('Voice draft belongs to the session controller; the text composer does not depend on voiceSending',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const hook=read('apps/android/features/chat/useNativeChatMediaUpload.ts');
 const voice=hook.slice(hook.indexOf(' async function sendVoice'),hook.indexOf(' async function sendSelectedMedia'));
 const view=read('apps/android/features/chat/NativeChatSurface.tsx');
 const recorder=read('apps/android/features/chat/NativeChatVoiceRecorder.tsx');
 const transport=read('apps/android/services/native-chat-r2-upload.ts');
 assert.match(voice,/voiceRef\.current=item;setVoiceDraft\(item\)/);
 assert.doesNotMatch(voice,/setMediaUploading/);
 assert.match(voice,/mediaUploadBusy\.current=true;setVoiceSending\(true\)/);
 assert.match(voice,/finally\{[\s\S]*?mediaUploadBusy\.current=false/);
 assert.match(hook,/voiceRequest\.current\?\.abort\(\)/);
 assert.match(view,/sendVoice\(voiceDraft\.uri,voiceDraft\.id\)/);
 assert.match(view,/disabled=\{savingEdit\|\|mediaUploading\|\|\(!editing&&selectedMedia\.length>0&&voiceSending\)/);
 assert.doesNotMatch(recorder,/setPending/);
 assert.match(transport,/if\(picked\.kind==='audio'\)\{/);
 assert.match(transport,/body:file/);
 assert.match(transport,/\},25_000,ownerSignal\)/);
});
