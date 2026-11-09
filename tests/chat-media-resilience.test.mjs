import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

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

test('Photo chat uses sharp lightweight previews and unmodified fullscreen originals',()=>{
 const web=read('apps/pwa/src/features/chat/ChatMediaView.tsx');
 const hook=read('apps/pwa/src/features/chat/useChatMediaPreview.ts');
 const thumb=read('apps/pwa/src/features/chat/chat-photo-preview.ts');
 const viewer=read('apps/pwa/src/features/chat/ChatPhotoViewer.tsx');
 const grant=read('apps/pwa/src/features/chat/chat-media-grant.ts');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 assert.match(web,/useChatMediaPreview\(media,token\)/);
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
 assert.match(viewer,/original&&<img src=\{original\}/);
 assert.doesNotMatch(viewer,/src=\{original\|\|preview\}/);
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
