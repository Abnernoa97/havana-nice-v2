import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('New large Android video selections are optimized locally before admission and upload',()=>{
 const helper=read('apps/android/features/chat/native-chat-video-compression.ts');
 const hook=read('apps/android/features/chat/useNativeMediaSelection.ts');
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
 assert.match(hook,/await optimizeNativeChatVideo\(item/);
 assert.match(hook,/await stageNativePendingVideo\(optimized,current\)/);
 assert.ok(hook.indexOf('await saved;')<hook.indexOf('selectedRef.current=[...selectedRef.current,...additions]'));
});

test('Compression orchestration keeps small videos, accepts smaller outputs and cleans failed exports',async()=>{
 const files=new Map(),deleted=[];
 let size=10_000_000,fail=false,calls=0,intervals=0,space=1e10;
 class FakeFile {
  constructor(base,name){this.uri=base.uri+'/'+name;}
  get exists(){return files.has(this.uri);}
  get size(){return files.get(this.uri)??0;}
  delete(){deleted.push(this.uri);files.delete(this.uri);}
 }
 const native={
  compress:async(input,output,id,shortSide,bitrate)=>{
   calls++;assert.equal(shortSide,540);assert.equal(bitrate,850_000);
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
  assert.equal(intervals,0);
 }
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
