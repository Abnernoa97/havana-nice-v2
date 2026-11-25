import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Android loads a private JPEG independently of the player and produces bounded local covers',()=>{
 const view=read('apps/android/features/chat/NativeChatVideo.tsx');
 const uploader=read('apps/android/services/native-chat-r2-upload.ts');
 const maker=read('apps/android/services/native-chat-video-poster.ts');
 assert.match(view,/setPoster\(nativePosterUrl\(url\)\|\|''\)/);
 assert.match(view,/\{poster\?<Image/);
 assert.match(view,/if\(!opened\)return/);
 assert.doesNotMatch(view,/generateThumbnailsAsync|createVideoPlayer/);
 assert.match(uploader,/if\(picked.kind==='video'\)await publishNativeVideoPoster\(session.token,id,picked.uri,4500,ownerSignal\)/);
 assert.match(maker,/generateThumbnailsAsync\(\[0\],\{maxWidth:640,maxHeight:640\}\)/);
 assert.match(maker,/MAX_BYTES=256\*1024/);
 assert.match(maker,/if\(extracting\|\|signal.aborted\)return null/);
 assert.match(maker,/release\(player\);extracting=false/);
 assert.match(maker,/Promise.race\(\[work\(\),interrupted\]\)/);
 assert.match(maker,/await nativePut\(file,[^\n]+ctl.signal\)/);
 assert.match(read('apps/android/services/native-chat-binary-upload.ts'),/httpMethod:'PUT'/);
});
test('Browser awaits the derivative; historical repair uses owner, explicit action and real 404',()=>{
 const upload=read('apps/pwa/src/services/chat-media-upload.ts');
 const hook=read('apps/pwa/src/features/chat/usePwaChatMediaUpload.ts');
 const maker=read('apps/pwa/src/features/chat/chat-video-poster.ts');
 assert.match(upload,/await getPoster\?\.\(\)/);
 assert.match(hook,/item.videoPoster\?\.blob\?\?makeChatVideoPoster\(item.file\)/);
 assert.match(maker,/new WeakMap<File,Promise<Blob\|null>>/);
 assert.match(maker,/decoderTail=task.catch/);
 assert.match(maker,/ctl.signal.aborted\?null:load/);
 assert.match(maker,/signal.addEventListener\('abort',cancel,\{once:true\}\)/);
 const route=read('cloudflare/src/index.ts');
 assert.match(route,/if\(match&&request.method==='GET'\)return readChatMedia/);
 const backend=read('cloudflare/src/modules/chat/chat-media.js');
 assert.match(backend,/row.sender_id!==session.actorId/);
 for(const path of ['apps/android/features/chat/NativeChatVideo.tsx','apps/pwa/src/features/chat/ChatMediaView.tsx']){
  const source=read(path);
  assert.match(source,/if\(!canRepair\|\|/);
  assert.match(source,/method:'GET',signal:ctl.signal/);
  assert.match(source,/if\(status.status!==404\)return/);
  assert.match(source,/Crear portada/);
  assert.match(source,/repairRequest.current\?\.abort\(\)/);
 }
 assert.match(read('apps/android/features/chat/NativeChatTimeline.tsx'),/canRepair=\{mine\}/);
 assert.match(read('apps/pwa/src/features/chat/ChatTimeline.tsx'),/canRepair=\{owned\}/);
});
