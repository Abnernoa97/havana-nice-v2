import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('One shared photo/video original quality policy; runtime Worker controls enablement',()=>{
 const src=read('packages/shared/src/index.ts');
 assert.doesNotMatch(src,/CHAT_MEDIA_UPLOAD_ENABLED/);
 assert.match(src,/export type ChatMediaKind='photo'\|'video'/);
 assert.match(src,/export function validateChatMediaSelection/);
 assert.match(src,/export const CHAT_MEDIA_MAX_PER_SEND=5 as const/);
 assert.match(src,/100\*1024\*1024/);
 assert.match(src,/9_500_000_000/);
 assert.doesNotMatch(src,/audio\/mpeg|mimeTypes:\['audio\//);
});

test('installed Chat local storage keys stay compatible across cleanup releases',()=>{
 const android=read('apps/android/chatStorage.ts');
 const pwa=read('apps/pwa/src/services/local.ts');
 assert.match(android,/const KEY = 'havana-v2-chat-local-v1';/);
 assert.match(pwa,/const DB = 'havana-nice-v2-lab';/);
 assert.match(pwa,/const STORE = 'chat';/);
 assert.match(pwa,/const KEY = 'offline-outbox-v1';/);
 assert.match(android,/session: ChatSession/);
 assert.match(pwa,/session: ChatSession/);
 assert.match(android,/outbox: ChatMessage\[\]/);
 assert.match(pwa,/outbox: ChatMessage\[\]/);
});

test('Android native and iPhone PWA share the same Chat decisions, not alternate backends',()=>{
 const android=read('apps/android/App.tsx');
 const pwa=read('apps/pwa/src/App.tsx');
 const common=[
  'restoreNamedChatSession','getChatSnapshot','reconcileChatSnapshot',
  'reconcileUpdatedMessage','reconcileDeletedMessage','reconcileReactions',
  'messageDeliveryLabel','newClientMessageId','validateChatMediaSelection',
  'CHAT_MEDIA_MAX_PER_SEND','getChatMediaAvailability(session)'
 ];
 for(const [label,src] of [['Android',android],['PWA',pwa]]){
  for(const symbol of common)assert.ok(src.includes(symbol),label+' missing canonical '+symbol);
  assert.match(src,/function sendSelectedMedia\(\)\{|async function sendSelectedMedia\(\)\{/);
  if(label==='PWA')assert.match(src,/uploadChatFile\(session,item\.file,item\.selection\.kind/);
  assert.doesNotMatch(src,/HAVANA_CLOUD|cloud-media-adapter|media-upload\./);
 }
});

test('Android and PWA share one authenticated media-availability fetch without obsolete upload state',()=>{
 const shared=read('packages/shared/src/index.ts');
 assert.match(shared,/export async function getChatMediaAvailability/);
 assert.match(shared,/cache:'no-store'/);
 for(const path of ['apps/android/App.tsx','apps/pwa/src/App.tsx']){
  const source=read(path);
  assert.match(source,/getChatMediaAvailability\(session\)/);
  if(path.includes('/android/'))assert.match(source,/uploadNativeChatFile/);
  assert.doesNotMatch(source,/mediaBatchId|batchIndex/);
  assert.doesNotMatch(source,/fetch\(HAVANA_V2_DEV_API_BASE_URL\+'\/api\/chat\/media\/status'/);
 }
});

test('PWA attachment menu only offers Fotos and Video, with distinct media filters',()=>{
 const src=read('apps/pwa/src/App.tsx');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 const icon=read('apps/pwa/src/ChatComposerIcon.tsx');
 const start=src.indexOf("composerPanel==='attachments'&&<div");
 const end=src.indexOf("composerPanel==='emojis'&&<div",start);
 assert.ok(start>=0&&end>start);
 const menu=src.slice(start,end);
 assert.match(menu,/>Fotos<\/span>/);
 assert.match(menu,/>Video<\/span>/);
 assert.match(menu,/openGalleryMedia\('photo'\)/);
 assert.match(menu,/openGalleryMedia\('video'\)/);
 assert.equal((menu.match(/<button type="button"/g)||[]).length,2);
 assert.doesNotMatch(menu,/Galería|Cámara|Fotos y videos|Foto o video|openCamera/);
 assert.match(icon,/case 'video':shape=/);
 assert.equal((src.match(/<input className="chat-media-hidden-input" type="file"/g)||[]).length,3);
 assert.match(src,/ref=\{photosPicker\}/);
 assert.match(src,/ref=\{videoPicker\}/);
 assert.match(src,/accept="image\/\*"/);
 assert.match(src,/accept="video\/\*"/);
 for(const old of ['galleryPicker','openMediaPicker','chat-attach-button','chat-media-menu',
  'mediaMenuOpen','mediaInputs','chat-attachments-popover button small']){
  assert.ok(!src.includes(old)&&!css.includes(old),'Obsolete source: '+old);
 }
 assert.match(src,/sendSelectedMedia/);
 assert.match(src,/multiple onChange=/);
 assert.match(src,/mediaQueue\.current\.length\+files\.length>CHAT_MEDIA_MAX_PER_SEND/);
 assert.match(src,/selectedMedia\.map\(item=>/);
 assert.equal(existsSync(new URL('../apps/pwa/src/media-upload.ts',import.meta.url)),false);
});

test('PWA camera icon requests camera capture directly instead of media gallery',()=>{
 const src=read('apps/pwa/src/App.tsx');
 assert.match(src,/const openCamera=\(\)=>/);
 assert.match(src,/cameraPicker\.current\?\.click\(\)/);
 assert.match(src,/onClick=\{openCamera\}/);
 assert.match(src,/ref=\{cameraPicker\}/);
 assert.match(src,/accept="image\/\*" capture="environment"/);
 assert.match(src,/chooseMedia\('camera','photo'/);
 assert.doesNotMatch(src,/accept="image\/\*,video\/\*"\s*capture/);
 assert.match(src,/URL.createObjectURL\(file\)/);
 assert.match(src,/URL.revokeObjectURL\(removed.selection.uri\)/);
 assert.match(src,/onSubmit=\{event=>\{event.preventDefault\(\);if\(selectedMedia/);
});

test('Android native: two gallery filters, camera direct, no legacy extra menu',()=>{
 const src=read('apps/android/App.tsx');
 const icons=read('apps/android/ChatComposerIcon.tsx');
 const manifest=JSON.parse(read('apps/android/package.json'));
 const lock=JSON.parse(read('package-lock.json'));
 const config=JSON.parse(read('apps/android/app.json'));
 assert.equal(manifest.dependencies['expo-image-picker'],'~58.0.10');
 assert.equal(lock.packages['apps/android'].dependencies['expo-image-picker'],'~58.0.10');
 assert.equal(lock.packages['node_modules/expo-image-picker'].version,'58.0.10');
 assert.ok(config.expo.plugins.some(x=>Array.isArray(x)&&x[0]==='expo-image-picker'));
 assert.match(src,/chooseNativeMedia\('gallery','photo'\)/);
 assert.match(src,/chooseNativeMedia\('gallery','video'\)/);
 assert.match(src,/chooseNativeMedia\('camera'\)/);
 assert.match(src,/mediaTypes:source==='camera'\?\['images','videos'\]:kind==='photo'\?\['images'\]:\['videos'\]/);
 assert.match(src,/launchImageLibraryAsync\(options\)/);
 assert.match(src,/launchCameraAsync\(options\)/);
 assert.match(src,/requestCameraPermissionsAsync\(\)/);
 assert.match(icons,/name==='video'/);
 const start=src.indexOf("composerPanel==='attachments'&&<View");
 const end=src.indexOf("composerPanel==='emojis'&&<View",start);
 assert.ok(start>=0&&end>start);
 const menu=src.slice(start,end);
 assert.match(menu,/>Fotos<\/Text>/);
 assert.match(menu,/>Video<\/Text>/);
 assert.equal((menu.match(/<Pressable style=\{styles.attachmentItem\}/g)||[]).length,2);
 assert.doesNotMatch(menu,/Galería|Cámara|Fotos y videos|Foto o video/);
 for(const old of ['cameraSymbol','attachmentDescription','mediaMenuOpen','styles.mediaMenu',
  'styles.mediaPlus','styles.sendButton'])
  assert.ok(!src.includes(old),'Obsolete Android UI: '+old);
 assert.match(src,/sendSelectedMedia/);
 assert.match(src,/quality:1/);
 assert.match(src,/allowsMultipleSelection:source==='gallery'/);
 assert.match(src,/selectionLimit:source==='gallery'\?free:1/);
 assert.match(src,/selectedMedia\.map\(item=>/);
 assert.equal(manifest.dependencies['expo-file-system'],'~58.0.11');
 assert.equal(existsSync(new URL('../apps/android/media-upload.ts',import.meta.url)),false);
});

test('Emoji stays enabled; microphone is informative until M03',()=>{
 const pwa=read('apps/pwa/src/App.tsx');
 const native=read('apps/android/App.tsx');
 assert.match(pwa,/aria-label="Insertar emoji"/);
 assert.match(native,/accessibilityLabel="Insertar emoji"/);
 assert.match(pwa,/Los mensajes de voz se habilitarán después de fotos y videos/);
 assert.match(native,/Los audios estarán disponibles después de las fotografías y los videos/);
 assert.doesNotMatch(native,/requestMicrophonePermissionsAsync|startRecording\(/);
 assert.doesNotMatch(pwa,/getUserMedia|MediaRecorder/);
});

test('V2 does not contain an external storage service binding',()=>{
 const config=JSON.parse(read('cloudflare/wrangler.jsonc'));
 assert.equal(config.name,'havana-nice-v2-dev');
 assert.deepEqual(config.services||[],[]);
 assert.deepEqual(config.vars,{HAVANA_ENV:'development',V2_ADMIN_LOGIN_MODE:'enabled'});
});

test('Media-only bubbles remain visual across Chat PWA, native and Administrator',()=>{
 const pwa=read('apps/pwa/src/App.tsx');
 const android=read('apps/android/App.tsx');
 const admin=read('apps/pwa/src/AdminChatGeneral.tsx');
 assert.match(pwa,/!message\.media&&<div>\{message\.text\}<\/div>/);
 assert.match(android,/!message\.media\?<Text/);
 assert.match(admin,/!m\.media&&<p>\{m\.text\}<\/p>/);
 assert.match(pwa,/message\.media&&<ChatMediaView/);
 assert.match(admin,/m\.media&&<ChatMediaView/);
 assert.match(android,/message\.media\?<NativeChatMediaView/);
});
test('Native photo uses a fully verified local cache and modal without a browser; video plays inline',()=>{
 const native=read('apps/android/NativeChatMediaView.tsx');
 const packageManifest=JSON.parse(read('apps/android/package.json'));
 assert.equal(packageManifest.dependencies['expo-video'],'58.0.12');
 assert.match(native,/useVideoPlayer/);
 assert.match(native,/<VideoView player=\{player\} nativeControls/);
 assert.match(native,/surfaceType="surfaceView"/);
 assert.doesNotMatch(native,/surfaceType="textureView"/);
 assert.match(native,/useEvent\(player,'statusChange'/);
 assert.match(native,/onRetry=\{\(\)=>setVideoAttempt/);
 assert.match(native,/File\.downloadFileAsync/);
 assert.match(native,/finished\.size!==media\.sizeBytes/);
 assert.match(native,/cached\.exists&&cached\.size===media\.sizeBytes/);
 assert.match(native,/<Modal visible=\{media\.kind==='photo'&&enlarged&&!!photo\}/);
 assert.doesNotMatch(native,/Linking\.openURL|media\.name\} ·|Reproducir video/);
 assert.match(native,/setPhoto\(cached\.uri\)/);
});
test('Native photo-cache housekeeping touches only stale incomplete V2 transfers',()=>{
 const native=read('apps/android/NativeChatMediaView.tsx');
 assert.match(native,/PARTIAL_TRANSFER_TTL=24\*60\*60\*1000/);
 assert.match(native,/function pruneAbandonedPhotoTransfers\(\)/);
 assert.match(native,/Paths\.cache\.list\(\)/);
 assert.match(native,/entry instanceof File/);
 assert.match(native,/entry\.modificationTime/);
 assert.match(native,/hn-v2-photo-transfer-/);
 assert.match(native,/\.part\$/);
 assert.match(native,/if\(now-lastPartialTransferSweep<PARTIAL_TRANSFER_TTL\)return/);
 assert.match(native,/cached\.exists&&cached\.size===media\.sizeBytes/);
 assert.doesNotMatch(native,/Paths\.cache\.delete\(\)|hn-v2-chat-photo-.*\.delete\(/);
});

test('Web/Admin originals are fully downloaded once before opening, without forced gray letterboxes',()=>{
 const web=read('apps/pwa/src/ChatMediaView.tsx');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 assert.match(web,/await image\.blob\(\)/);
 assert.match(web,/URL\.createObjectURL\(blob\)/);
 assert.match(web,/<img src=\{ready\} alt="Fotografía ampliada"/);
 assert.doesNotMatch(css,/\.hn-chat-photo\{[^}]*max-height:/);
 assert.doesNotMatch(css,/\.hn-chat-video\{[^}]*aspect-ratio:4\/5/);
});

test('one real original-quality R2 uploader for Chat PWA with Familia fast multipart',()=>{
 const uploader=read('apps/pwa/src/services/chat-media-upload.ts');
 const member=read('apps/pwa/src/App.tsx');
 const backend=read('cloudflare/src/chat-media.js');
 assert.match(uploader,/!begin\.multipart/);
 assert.match(uploader,/5\*1024\*1024/);
 assert.match(uploader,/Math\.min\(3,begin\.partCount\)/);
 assert.match(uploader,/WeakMap<File,string>/);
 assert.match(uploader,/xhr\.upload\.onprogress/);
 assert.match(uploader,/\/complete/);
 assert.match(uploader,/\/send/);
 assert.match(member,/mediaProgress/);
 assert.match(member,/progress aria-label="Progreso de subida"/);
 assert.match(backend,/message_seq/);
 assert.doesNotMatch(uploader,/HAVANA_CLOUD|Supabase|Drive/);
});
