import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('New Android video selections are protected locally and optimized before any R2 start',()=>{
 const helper=read('apps/android/features/chat/native-chat-video-compression.ts');
 const hook=read('apps/android/features/chat/useNativeMediaSelection.ts');
 const uploader=read('apps/android/features/chat/useNativeChatMediaUpload.ts');
 const native=read('apps/android/modules/havana-video-compression/android/src/main/java/expo/modules/havanavideo/HavanaVideoCompressionModule.kt');
 const config=JSON.parse(read('apps/android/modules/havana-video-compression/expo-module.config.json'));
 const gradle=read('apps/android/modules/havana-video-compression/android/build.gradle');
 assert.deepEqual(config.android.modules,['expo.modules.havanavideo.HavanaVideoCompressionModule']);
 assert.match(gradle,/media3-transformer:1\.9\.1/);
 assert.match(native,/Name\("HavanaVideoCompression"\)/);
 assert.match(native,/setVideoMimeType\(MimeTypes.VIDEO_H264\)/);
 assert.match(native,/setAudioMimeType\(MimeTypes.AUDIO_AAC\)/);
 assert.match(native,/setBitrate\(bitrate.coerceIn\(500_000, 1_100_000\)\)/);
 assert.match(native,/AudioEncoderSettings.Builder\(\).setBitrate\(96_000\)/);
 assert.match(native,/Presentation.createForShortSide/);
 assert.match(native,/transformer.start\(edited, file.absolutePath\)/);
 assert.match(native,/transformer.cancel\(\)/);
 assert.match(native,/file.parentFile == context.filesDir.canonicalFile/);
 assert.match(helper,/COMPRESS_ABOVE=12\*1024\*1024/);
 assert.match(helper,/item.sizeBytes<=COMPRESS_ABOVE\)return item/);
 assert.match(helper,/size>=item.sizeBytes\*\.9\)return item/);
 assert.match(helper,/sizeBytes:size/);
 assert.match(helper,/native.cancel\(item.id\)/);
 assert.doesNotMatch(helper,/fetch\(|source.delete|readBytes|base64/);
 assert.match(hook,/ImagePicker.launchImageLibraryAsync\(options\)/);
 assert.doesNotMatch(hook,/File.pickFileAsync/);
 assert.doesNotMatch(hook,/optimizeNativeChatVideo/);
 assert.match(hook,/await stageNativePendingVideo\(item,current\)/);
 assert.match(hook,/videoInput:\{width:asset.width,height:asset.height,durationMs:asset.duration/);
 assert.match(uploader,/await optimizeNativeChatVideo\(item,item.videoInput,live/);
 assert.match(uploader,/await commitPreparedVideo\(next\)/);
 assert.match(uploader,/if\(!item.videoInput\)return item/);
 assert.match(uploader,/compressionTail=task.then/);
 assert.ok(uploader.indexOf('await commitPreparedVideo(next)')<uploader.indexOf('return prepareNativeChatFile(session,ready'));
 assert.ok(hook.indexOf('writeChain.current=saved;await saved;')<hook.indexOf('selectedRef.current=[...selectedRef.current,...additions]'));
});

test('Compression orchestration keeps small videos, accepts smaller outputs and cleans failed exports',async()=>{
 const files=new Map(),deleted=[];
 let size=10_000_000,fail=false,calls=0,intervals=0,space=1e10;
 const policies=[];
 class FakeFile {
  constructor(base,name){this.uri=base.uri+'/'+name;}
  get exists(){return files.has(this.uri);}
  get size(){return files.get(this.uri)??0;}
  delete(){deleted.push(this.uri);files.delete(this.uri);}
 }
 const native={
  compress:async(input,output,id,shortSide,bitrate)=>{
   calls++;policies.push([shortSide,bitrate]);
   files.set(output,size);
   if(fail)throw Error('encoder');
   return size;
  },progress:async()=>40,cancel:async()=>{}
 };
 const exports={};
 const dependencies={
  expo:{requireOptionalNativeModule:()=>native},
  'expo-file-system':{File:FakeFile,Paths:{document:{uri:'private'},get availableDiskSpace(){return space;}}},
  'react-native':{Platform:{OS:'android'}}
 };
 runInNewContext(ts.transpileModule(read('apps/android/features/chat/native-chat-video-compression.ts'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText,{exports,require:p=>dependencies[p],Date,Error,
  setInterval:()=>{intervals++;return 1;},clearInterval:()=>{intervals--;}});
 const optimize=exports.optimizeNativeChatVideo;
 const item=(n,id)=>({id,kind:'video',uri:'gallery/'+id,mimeType:'video/mp4',sizeBytes:n,name:id+'.mov'});
 const dimensions={width:1920,height:1080},current=()=>true,progress=()=>{};
 const small=item(2_000_000,'small');
 assert.equal(await optimize(small,dimensions,current,progress),small);assert.equal(calls,0);
 for(const [n,id] of [[202598693,'a'],[630282724,'b']]){
  const input=item(n,id),output=await optimize(input,dimensions,current,progress);
  assert.equal(output.id,id);assert.equal(output.name,id+'.mp4');
  assert.equal(output.sizeBytes,size);assert.notEqual(output.uri,input.uri);
  assert.deepEqual(policies.at(-1),[540,850_000]);
  assert.equal(intervals,0);
 }
 const brief=item(25_000_000,'brief');
 await optimize(brief,{...dimensions,durationMs:20_000},current,progress);
 assert.deepEqual(policies.at(-1),[720,1_100_000]);
 const long=item(150_000_000,'long');
 await optimize(long,{...dimensions,durationMs:240_000},current,progress);
 assert.deepEqual(policies.at(-1),[540,700_000]);
 const compact=item(20_000_000,'compact');const priorCalls=calls;
 assert.equal(await optimize(compact,{...dimensions,durationMs:240_000},current,progress),compact);
 assert.equal(calls,priorCalls);
 size=95_000_000;
 const noGain=item(100_000_000,'c');
 assert.equal(await optimize(noGain,dimensions,current,progress),noGain);
 assert.equal(files.has('private/hn-v2-chat-pending-c-optimized.mp4'),false);
 fail=true;
 await assert.rejects(optimize(item(200_000_000,'d'),dimensions,current,progress),/encoder/);
 assert.equal(files.has('private/hn-v2-chat-pending-d-optimized.mp4'),false);
 assert.equal(intervals,0);
 fail=false;space=1;
 await assert.rejects(optimize(item(200_000_000,'e'),dimensions,current,progress),/espacio/);
 assert.ok(deleted.every(p=>!p.startsWith('gallery/')));
});


test('Native range transport sends two exact file ranges, reconciles a lost reply and skips saved parts',async()=>{
 const source=read('apps/android/services/native-chat-r2-upload.ts');
 const exports={},size=26*1024*1024,part=5*1024*1024,total=Math.ceil(size/part);
 const id='00000000-0000-4000-8000-000000000009',stored=new Set([1]),calls=[],published=[],progress=[];
 let active=0,peak=0,statusReads=0,finished=false;
 class FakeFile{constructor(uri){this.uri=uri;}get exists(){return true;}get size(){return size;}}
 const native={
  uploadRange:async(uri,url,token,mime,offset,length,key)=>{
   const n=Number(url.split('/').at(-1));calls.push(n);active++;peak=Math.max(peak,active);
   assert.equal(uri,'file:///private/video.mp4');assert.equal(token,'test');assert.equal(offset,(n-1)*part);
   assert.equal(length,Math.min(part,size-offset));
   try{
    await new Promise(r=>setTimeout(r,4));
    stored.add(n);
    if(n===2)throw Error('reply lost after commit');
    return {bytes:length,elapsedMs:4};
   }finally{active--;}
  },
  uploadProgress:async()=>0,cancelUpload:async()=>{}
 };
 const response=body=>({ok:true,json:async()=>body});
 const state=()=>({id,ready:false,multipart:true,partSize:part,partCount:total,completedParts:[...stored]});
 const fakeFetch=async(url,options)=>{
  if(url.endsWith('/start'))return response(state());
  if(url.endsWith('/complete')){assert.equal(stored.size,total);finished=true;return response({ready:true});}
  if(url.endsWith('/send')){assert.ok(finished);published.push(id);return response({seq:42});}
  statusReads++;return response(state());
 };
 const deps={
  expo:{requireOptionalNativeModule:()=>native},
  'expo-file-system':{File:FakeFile},
  './native-chat-binary-upload':{nativePut:()=>assert.fail('video took old transport')},
  '../features/chat/native-media-transfer':{runNativeTransferStep:async(label,ms,fn,signal)=>fn(signal??new AbortController().signal)},
  '../features/chat/native-voice-transfer':{},
  './native-chat-video-poster':{publishNativeVideoPoster:async()=>true},
  '@havana/shared':{HAVANA_V2_DEV_API_BASE_URL:'https://example.invalid'}
 };
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,require:p=>deps[p],fetch:fakeFetch,AbortController,Date,console:{info:()=>{}},setTimeout,setInterval,clearInterval});
 const prepared=await exports.prepareNativeChatFile({token:'test'},{id,kind:'video',source:'gallery',uri:'file:///private/video.mp4',mimeType:'video/mp4',sizeBytes:size,name:'video.mp4'},n=>progress.push(n),new AbortController().signal);
 assert.equal(peak,2);assert.equal(calls.includes(1),false);assert.equal(calls.filter(n=>n===2).length,1);
 assert.equal(statusReads,1);assert.equal(stored.size,total);assert.equal(progress.at(-1),size);
 assert.equal(published.length,0);const result=await prepared.publish();assert.equal(result.seq,42);
 assert.deepEqual(published,[id]);
});
