import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Pending attachments never carry across member session changes',()=>{
 const web=read('apps/pwa/src/features/chat/usePwaMediaSelection.ts');
 const native=read('apps/android/features/chat/useNativeMediaSelection.ts');
 for(const source of [web,native]){
   assert.match(source,/const mediaOwner=useRef\(actorId\)/);
   const effect=source.match(/useLayoutEffect\(\(\)=>\{[\s\S]*?\},\[actorId\]\);/)?.[0];
   assert.ok(effect,'Each media selector must clear its transient queue on an actor change');
   assert.match(effect,/if\(mediaOwner\.current===actorId\)return/);
   assert.match(effect,/mediaOwner\.current=actorId/);
   assert.match(effect,/setSelectedMedia\(\[\]\)/);
   assert.match(effect,/setMediaError\(''\)/);
   assert.doesNotMatch(effect,/clearChatMediaDraft|clearNativePendingMedia|discardNativePendingMedia|persistQueue\(\[\]\)/);
 }
 assert.match(web,/for\(const item of mediaQueue\.current\)URL\.revokeObjectURL\(item\.selection\.uri\)/);
 assert.match(web,/mediaQueue\.current=\[\]/);
 assert.match(native,/selectedRef\.current=\[\]/);
 assert.match(web,/loadChatMediaDraft\(actorId\)/);
 assert.match(native,/loadNativePendingMedia\(actorId\)/);
});

test('Startup always opens Home; recovery of old media never changes the destination',()=>{
 const web=read('apps/pwa/src/app/App.tsx');
 const native=read('apps/android/app/NativeApp.tsx');
 const webPicker=read('apps/pwa/src/features/chat/usePwaMediaSelection.ts');
 const nativePicker=read('apps/android/features/chat/useNativeMediaSelection.ts');
 assert.match(web,/const \[activeScreen,setActiveScreen\]=useState<MemberScreen>\('home'\)/);
 assert.match(native,/const \[activeScreen,setActiveScreen\]=useState<MemberScreen>\('home'\)/);
 assert.doesNotMatch(web,/readChatReturnIntent|writeChatReturnIntent|chat-media-return/);
 assert.doesNotMatch(webPicker,/onCameraLaunch|setActiveScreen/);
 assert.match(webPicker,/picker\.click\(\)/);
 assert.match(webPicker,/loadChatMediaDraft\(actorId\)/);
 assert.match(nativePicker,/loadNativePendingMedia\(actorId\)/);
 assert.doesNotMatch(nativePicker,/setSelectedMedia\(\[\.\.\.saved\]\);onRecovered\(\)/);
 assert.match(nativePicker,/if\(recovered&&active\)onRecovered\(\)/);
});
test('PWA selection protects original photos in a separate short-lived draft',()=>{
 const picker=read('apps/pwa/src/features/chat/usePwaMediaSelection.ts');
 const store=read('apps/pwa/src/features/chat/chat-media-draft.ts');
 const app=read('apps/pwa/src/app/App.tsx');
 assert.match(picker,/loadChatMediaDraft\(actorId\)/);
 assert.match(picker,/saveChatMediaDraft\(actorId,records\)/);
 assert.match(picker,/persistChain\.current=persistChain\.current\.catch/);
 assert.match(picker,/new File\(\[file\],name,\{type:mime/);
 assert.match(picker,/confirmUploadedMedia=\(id:string\)=>/);
 assert.match(store,/80\*1024\*1024/);
 assert.match(store,/const TTL_MS=24\*60\*60\*1000/);
 assert.match(store,/record\.actorId!==actorId/);
 assert.match(store,/record\.items\.some/);
 assert.match(store,/store\.delete\(KEY\)/);
 assert.match(app,/confirmUploadedMedia\(item\.id\)/);
 assert.match(app,/uploadChatFile\(session,item\.file,item\.selection\.kind,onSent,item\.id\)/);
 assert.doesNotMatch(store,/localStorage\.setItem|saveLocalChat\(|session\.token/);
});

test('Native recovers Android picker after Activity destruction and isolates originals',()=>{
 const hook=read('apps/android/features/chat/useNativeMediaSelection.ts');
 const native=read('apps/android/app/NativeApp.tsx');
 const store=read('apps/android/storage/chatPendingMedia.ts');
 assert.match(hook,/ImagePicker\.getPendingResultAsync\(\)/);
 assert.match(hook,/onRecovered\(\)/);
 assert.match(native,/onRecovered:\(\)=>setActiveScreen\('chat'\)/);
 assert.match(hook,/preserveNativePendingMedia\(additions\)/);
 assert.match(hook,/loadNativePendingMedia\(actorId\)/);
 assert.match(store,/new File\(Paths\.document,PREFIX\+id\+extension\)/);
 assert.match(store,/await new File\(item\.uri\)\.copy\(destination\)/);
 assert.match(store,/if\(!stagedFile\(item\)\)return/);
 assert.match(store,/const TTL=24\*60\*60\*1000/);
 assert.match(store,/data\.actorId!==actorId/);
 assert.match(native,/confirmUploadedMedia\(item\.id\)/);
});

test('Retry keeps exactly one media message ID across app restart',()=>{
 const pwaUploader=read('apps/pwa/src/services/chat-media-upload.ts');
 const nativeUploader=read('apps/android/services/native-chat-r2-upload.ts');
 const picker=read('apps/android/features/chat/useNativeMediaSelection.ts');
 assert.match(pwaUploader,/let id=stableId\?\?savedIds\.get\(file\)/);
 assert.match(nativeUploader,/const id=stable\?picked\.id:/);
 assert.match(picker,/const newMediaSelectionId=\(\)=> 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'/);
 for(const source of [pwaUploader,nativeUploader]){
   assert.match(source,/\/send/);
   assert.match(source,/\/complete/);
 }
});

test('Photo chat uses sharp previews and progressive fullscreen media',()=>{
 const web=read('apps/pwa/src/features/chat/ChatMediaView.tsx');
 const hook=read('apps/pwa/src/features/chat/useChatMediaPreview.ts');
 const thumb=read('apps/pwa/src/features/chat/chat-photo-preview.ts');
 const viewer=read('apps/pwa/src/features/chat/ChatPhotoViewer.tsx');
 const grant=read('apps/pwa/src/features/chat/chat-media-grant.ts');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 assert.match(web,/useChatMediaPreview\(media,token,videoRequest\)/);
 assert.match(web,/photoOpen&&<ChatPhotoViewer media=\{media\}/);
 assert.match(hook,/fetchChatPhotoThumbnail\(signed,controller\.signal\)/);
 assert.match(hook,/IntersectionObserver/);
 assert.match(hook,/rootMargin:'320px'/);
 assert.match(hook,/setVisible\(false\)/);
 assert.match(hook,/clearTimeout\(releaseTimer\)/);
 assert.match(hook,/URL\.revokeObjectURL\(previewUrl\)/);
 assert.match(thumb,/CHAT_PREVIEW_LONG_EDGE=1440/);
 assert.match(thumb,/CHAT_PREVIEW_JPEG_QUALITY=\.92/);
 assert.match(thumb,/CHAT_PREVIEW_MAX_ACTIVE=2/);
 assert.match(thumb,/canvas\.toBlob/);
 assert.match(thumb,/originalType==='image\/png'\?'image\/png':'image\/jpeg'/);
 assert.match(viewer,/requestChatMediaUrl\(media\.assetId,token,controller\.signal\)/);
 assert.match(viewer,/URL\.revokeObjectURL\(objectUrl\)/);
 assert.match(viewer,/\(original\|\|preview\)&&<img src=\{original\|\|preview\}/);
 assert.match(grant,/Authorization:'Bearer '\+token/);
 assert.match(css,/\.chat-media-queue-items\{max-height:190px/);
 assert.doesNotMatch(css,/\.chat-media-hidden-input\{display:none/);
});

test('Busy upload cannot remove originals; failed sends keep their queue',()=>{
 const web=read('apps/pwa/src/features/chat/usePwaMediaSelection.ts');
 const native=read('apps/android/features/chat/useNativeMediaSelection.ts');
 const app=read('apps/pwa/src/app/App.tsx');
 const expo=read('apps/android/app/NativeApp.tsx');
 const webPreview=read('apps/pwa/src/features/chat/PwaChatMediaQueuePreview.tsx');
 const nativePreview=read('apps/android/features/chat/NativeChatMediaQueuePreview.tsx');
 assert.match(web,/if\(uploadBusy\.current\)return/);
 assert.match(native,/if\(uploadBusy\.current\)return/);
 assert.match(webPreview,/disabled=\{mediaUploading\}/);
 assert.match(nativePreview,/disabled=\{mediaUploading\}/);
 assert.match(app,/catch\(e\)\{\s*setMediaError\(/);
 assert.match(expo,/catch\(e\)\{\s*setMediaError\(/);
 assert.doesNotMatch(app,/mediaUploadBusy\.current=false;setMediaUploading\(false\);setSelectedMedia\(\[\]\)/);
});

test('PWA upload ref exists before media selection hook executes',()=>{
 const app=read('apps/pwa/src/app/App.tsx');
 const declaration=app.indexOf('const mediaUploadBusy=useRef(false)');
 const picker=app.indexOf('usePwaMediaSelection({');
 assert.equal(declaration>=0,true);
 assert.equal(picker>declaration,true);
 assert.equal(app.indexOf('const mediaUploadBusy=useRef(false)',declaration+1),-1);
});

test('PWA keeps a private, bounded preview cache and never stores signed grants',()=>{
 const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const hook=read('apps/pwa/src/features/chat/useChatMediaPreview.ts');
 const cache=read('apps/pwa/src/features/chat/chat-photo-thumbnail-cache.ts');
 assert.match(hook,/peekChatPhotoPreview\(token,media\)/);
 assert.match(hook,/loadChatPhotoPreview\(token,media\)/);
 assert.match(hook,/storeChatPhotoPreview\(token,media,thumbnail\)/);
 assert.ok(hook.indexOf('loadChatPhotoPreview(token,media)')<
   hook.indexOf('requestChatMediaUrl(media.assetId,token,controller.signal)'));
 assert.match(hook,/URL\.revokeObjectURL\(previewUrl\)/);
 assert.match(cache,/crypto\.subtle\.digest\('SHA-256'/);
 assert.match(cache,/CHAT_PREVIEW_DISK_LIMIT_BYTES=48\*1024\*1024/);
 assert.match(cache,/CHAT_PREVIEW_TTL_MS=14\*24\*60\*60\*1000/);
 assert.doesNotMatch(cache,/localStorage|sessionStorage|remoteUrl|grantUrl/);
});

test('a PWA sender reuses its local photo without changing video or R2 transport',()=>{
 const src=read('apps/pwa/src/app/App.tsx');
 assert.match(src,/if\(item\.selection\.kind==='photo'\)/);
 assert.match(src,/createChatPhotoThumbnail\(item\.file\)/);
 assert.match(src,/storeChatPhotoPreview\(session\.token,/);
 assert.match(src,/return uploadChatFile\(session,item\.file,item\.selection\.kind,onSent,item\.id\)/);
 assert.doesNotMatch(src,/uploadChatFile\(session,thumb/);
});

test('iPhone video grants are request-on-tap, with fixed photo/video frames',()=>{
 const media=read('apps/pwa/src/features/chat/ChatMediaView.tsx');
 const preview=read('apps/pwa/src/features/chat/useChatMediaPreview.ts');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 assert.match(media,/videoRequest===0\?/);
 assert.match(media,/onClick=\{\(\)=>setVideoRequest\(1\)\}/);
 assert.match(media,/preload="none"/);
 assert.match(media,/hn-photo-placeholder/);
 assert.match(media,/hn-video-placeholder/);
 assert.match(preview,/if\(media\.kind==='video'\)\{\s*if\(videoRequest===0\)return/);
 assert.match(css,/\.hn-chat-image-button\{position:relative;display:block;aspect-ratio:1\/1/);
 assert.match(css,/\.hn-chat-video,\.hn-media-loading\.hn-video-placeholder\{width:100%;aspect-ratio:16\/9/);
 assert.match(css,/\.chat-messages\{-webkit-overflow-scrolling:touch;overflow-anchor:none;touch-action:pan-y\}/);
});

test('iPhone photo preparation is visible and isolated across actor switches',()=>{
 const picker=read('apps/pwa/src/features/chat/usePwaMediaSelection.ts');
 const app=read('apps/pwa/src/app/App.tsx');
 const view=read('apps/pwa/src/features/chat/PwaChatMediaQueuePreview.tsx');
 const backend=read('cloudflare/src/modules/chat/chat-media.js');
 assert.match(picker,/photoEncodeTasks\.current\.clear\(\)/);
 assert.match(picker,/setPhotoPreparing\(true\)/);
 assert.match(picker,/setPhotoPreparing\(photoEncodeTasks\.current\.size>0\)/);
 assert.match(app,/photoPreparing=\{photoPreparing\}/);
 assert.match(view,/photoPreparing\?'Preparando imágenes ligeras/);
 assert.match(backend,/\['image\/webp','photo'\]/);
 assert.match(backend,/row\.size_bytes!==size\|\|existing\.mime_type!==data\.mimeType/);
});

test('photo viewer displays cached preview immediately and inline photos are not forced square',()=>{
 const media=read('apps/pwa/src/features/chat/ChatMediaView.tsx');
 const viewer=read('apps/pwa/src/features/chat/ChatPhotoViewer.tsx');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 assert.match(media,/token=\{token\} preview=\{preview\}/);
 assert.match(viewer,/\(original\|\|preview\)&&<img src=\{original\|\|preview\}/);
 assert.match(css,/\.hn-chat-image-button\{aspect-ratio:auto;background:transparent\}/);
});

test('encoder deadline freezes late results before R2 upload starts',()=>{
 const picker=read('apps/pwa/src/features/chat/usePwaMediaSelection.ts');
 const app=read('apps/pwa/src/app/App.tsx');
 assert.match(picker,/Promise\.race\(\[/);
 assert.match(picker,/setTimeout\(resolve,1500\)/);
 assert.match(picker,/photoEncodeFrozen\.current\.add\(id\)/);
 assert.match(picker,/photoEncodeFrozen\.current\.has\(item\.id\)/);
 assert.match(picker,/if\(deadline!==null\)clearTimeout\(deadline\)/);
 assert.match(picker,/photoEncodeFrozen\.current\.clear\(\)/);
 assert.match(app,/await waitForMediaPreparation\(\)/);
 assert.ok(app.indexOf('await waitForMediaPreparation()')<
   app.indexOf('await uploadChatMediaBatch([...mediaQueue.current]'));
});
