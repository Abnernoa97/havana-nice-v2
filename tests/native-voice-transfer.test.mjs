import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runNativeTransferStep,transferNativeVisualBatch} from '../apps/android/features/chat/native-media-transfer.ts';
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
 assert.match(voice,/finally\{[\s\S]*?voiceRequest.current===ctl\)\{mediaUploadBusy.current=false/);
 assert.match(hook,/voiceRequest\.current\?\.abort\(\)/);
 assert.match(view,/sendVoice\(voiceDraft\.uri,voiceDraft\.id\)/);
 assert.match(view,/selectedMedia.length&&!editing&&!mediaUploading\?void sendSelectedMedia\(\):send\(\)/);
 assert.match(view,/disabled=\{savingEdit\|\|\(!editing&&!mediaUploading&&selectedMedia.length>0&&voiceSending\)/);
 assert.doesNotMatch(recorder,/setPending/);
 assert.match(transport,/if\(picked\.kind==='audio'\)\{/);
 assert.match(transport,/put:signal=>nativePut\(file,base\+'\/content'/);
 assert.match(transport,/createUploadTask\(url/);
 assert.match(transport,/signal\}:\{\}/);
 assert.match(transport,/\},25_000,ownerSignal\)/);
});


test('Home does not open a blocking profile-check modal on slow network',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('apps/android/app/NativeMemberHome.tsx'),/Modal visible=\{mustAdd\|\|profileOpen\}/);
 assert.match(read('apps/android/features/profile/useNativeMemberProfile.ts'),/8000/);
});


test('Two photos prepare concurrently but publish in selection order; videos are isolated',async()=>{
 const items=[{id:'a',kind:'photo',sizeBytes:10},{id:'b',kind:'photo',sizeBytes:10},{id:'c',kind:'video',sizeBytes:20},{id:'d',kind:'photo',sizeBytes:10}];
 const events=[],progress=[];let active=0,peak=0;
 await transferNativeVisualBatch(items,{
  prepare:async(item,report)=>{active++;peak=Math.max(peak,active);events.push('prepare:'+item.id);await new Promise(r=>setTimeout(r,item.id==='a'?12:1));report(item.sizeBytes);active--;return {publish:async()=>{events.push('publish:'+item.id);return {id:item.id,seq:events.length};}};},
  confirmed:item=>{events.push('confirm:'+item.id);},progress:n=>progress.push(n),
 },new AbortController().signal);
 assert.equal(peak,2);assert.deepEqual(events.filter(e=>e.startsWith('publish:')),['publish:a','publish:b','publish:c','publish:d']);
 assert.ok(events.indexOf('prepare:c')>events.indexOf('confirm:b'));
 assert.ok(progress.every((n,i)=>i===0||n>=progress[i-1]));assert.equal(progress.at(-1),100);
});
test('Failed first photo never publishes its later sibling and waits for sibling settlement',async()=>{
 const events=[];const items=['a','b'].map(id=>({id,kind:'photo',sizeBytes:1}));
 await assert.rejects(transferNativeVisualBatch(items,{
  prepare:async(item)=>{if(item.id==='a')throw Error('network');await new Promise(r=>setTimeout(r,8));events.push('settled:b');return {publish:async()=>{assert.fail('published out of order');}};},
  confirmed:()=>assert.fail(),progress:()=>{},
 },new AbortController().signal),/network/);assert.deepEqual(events,['settled:b']);
});
test('Bounded native stage rejects an unresponsive network and aborts its signal',async()=>{
 let signal;await assert.rejects(runNativeTransferStep('Subir',10,s=>{signal=s;return new Promise(()=>{});}),/Subir: la conexión tardó demasiado/);assert.equal(signal.aborted,true);
});
test('Cancellation prevents unconfirmed visual files from being published',async()=>{
 const ctl=new AbortController(),items=[{id:'a',kind:'photo',sizeBytes:1}];
 await assert.rejects(transferNativeVisualBatch(items,{prepare:async()=>{ctl.abort();return {publish:async()=>assert.fail()};},confirmed:()=>assert.fail(),progress:()=>{}},ctl.signal),/cancelado/);
});
test('Only real acknowledged sequences replace immediate local pending mosaics',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const view=read('apps/android/features/chat/NativeChatSurface.tsx');
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 const controller=read('apps/android/features/chat/useNativeChatController.ts');
 const upload=read('apps/android/features/chat/useNativeChatMediaUpload.ts');
 assert.match(view,/selectedMedia.filter\(item=>!committed.has\(item.id\)\)/);
 assert.match(timeline,/ListHeaderComponent=\{pendingMedia.length\?/);
 assert.match(controller,/confirmMediaMessage\(media:NonNullable/);
 assert.match(upload,/confirmMediaMessage\(media,result.seq\)/);
 assert.match(upload,/confirmUploadedMedia\(item.id\)/);
});
