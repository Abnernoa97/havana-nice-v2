import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Android stories use native view modules, not the web PWA renderer or Chat',()=>{
 const strip=read('apps/android/features/stories/NativeStories.tsx');
 const viewer=read('apps/android/features/stories/NativeStoryViewer.tsx');
 const photo=read('apps/android/features/stories/NativeStoryPhoto.tsx');
 const convo=read('apps/android/features/stories/NativeStoryConversation.tsx');
 const voice=read('apps/android/features/stories/NativeStoryVoiceRecorder.tsx');
 const shower=read('apps/android/features/stories/NativeStoryReactionShower.tsx');
 assert.match(strip,/NativeStoryViewer/);
 assert.match(viewer,/NativeStoryPhoto/);
 assert.match(viewer,/NativeStoryConversation/);
 assert.match(viewer,/NativeStoryReactionShower/);
 assert.match(photo,/React.memo/);
 assert.match(photo,/fadeDuration=\{0\}/);
 assert.match(viewer,/Image.prefetch/);
 assert.match(shower,/makeChatReactionParticles/);
 assert.match(convo,/useNativeStoryConversation/);
 assert.match(voice,/expo-audio/);
 for(const s of [strip,viewer,photo,convo,voice,shower]){
  assert.doesNotMatch(s,/WebView|new WebSocket|openChatSocket|saveNativeLocalChat|PageFlip|StPageFlip/);
 }
});
test('Same private backend contracts, expiry, five photo batch, 3 emojis and voice',()=>{
 const state=read('apps/android/features/stories/useNativeStories.ts');
 const convo=read('apps/android/features/stories/useNativeStoryConversation.ts');
 const voice=read('apps/android/features/stories/NativeStoryVoiceRecorder.tsx');
 const view=read('apps/android/features/stories/NativeStoryViewer.tsx');
 const pwa=read('apps/pwa/src/features/stories/StoryConversationPanel.tsx');
 assert.match(state,/STORY_BATCH_MAX/);
 assert.match(state,/\/api\/stories\/me\/batch/);
 assert.match(state,/ImageManipulator.manipulateAsync/);
 assert.match(state,/grants=useRef\(new Map/);
 assert.match(state,/now-old\.issuedAt<8\*60\*1000/);
 assert.match(convo,/getStoryConversation/);
 assert.match(convo,/sendStoryText/);
 assert.match(convo,/reactToStory/);
 assert.match(convo,/UploadType.BINARY_CONTENT/);
 assert.match(convo,/Content-Type':'audio\/mp4'/);
 assert.match(pwa,/const reactions:StoryEmoji\[\]=\['❤️','👏','😂'\]/);
 assert.match(read('apps/android/features/stories/NativeStoryConversation.tsx'),
  /const emojis:StoryEmoji\[\]=\['❤️','👏','😂'\]/);
 assert.match(voice,/RecordingPresets.HIGH_QUALITY/);
 assert.match(voice,/45000/);
 assert.match(voice,/Cancelar/);
 assert.match(voice,/Enviar voz/);
 assert.match(view,/STORY_PLAYBACK_MS/);
 assert.match(view,/useNativeDriver:true/);
 assert.doesNotMatch(view,/rotateY|perspective|Animated\.Value\(0\).*turn/);
});
test('Native image compression, strict version and incremental signing gate',()=>{
 const state=read('apps/android/features/stories/useNativeStories.ts');
 const app=JSON.parse(read('apps/android/app.json')).expo;
 const lock=JSON.parse(read('package-lock.json'));
 const pkg=JSON.parse(read('apps/android/package.json'));
 const workflow=read('.github/workflows/v2-android-apk.yml');
 assert.match(state,/resize:\{width:720\}/);
 assert.match(state,/compress:.74/);
 assert.match(state,/450_000/);
 assert.match(state,/1_500_000/);
 assert.equal(app.android.package,'com.havananice.v2');
 const approved=JSON.parse(read('releases/android-batch.json'));
 assert.equal(approved.approved,true);
 assert.equal(approved.releaseMode,'explicit-batch');
 assert.equal(app.version,approved.version);
 assert.equal(app.android.versionCode,approved.versionCode);
 assert.equal(app.android.package,'com.havananice.v2');
 assert.ok(app.plugins.some(p=>Array.isArray(p)&&p[0]==='expo-audio'));
 for(const d of ['expo-audio','expo-image-manipulator']){
  assert.equal(pkg.dependencies[d],lock.packages['apps/android'].dependencies[d]);
  assert.equal(pkg.dependencies[d],lock.packages['node_modules/'+d].version);
 }
 assert.match(workflow,/scripts\/apk-signature-gate.py/);
 assert.match(workflow,/previous_code.*-gt|current_code.*-gt/);
 assert.match(workflow,/HAVANA-NICE-V2-LATEST.apk/);
});

test('Every native musician section keeps the team story strip pinned, with Story API fallback',()=>{
 const shell=read('apps/android/app/NativeMemberHome.tsx');
 const strip=read('apps/android/features/stories/NativeStories.tsx');
 const profile=read('apps/android/features/profile/useNativeMemberProfile.ts');
 assert.match(shell,/useNativeMemberProfile\(token,actorId,true\)/);
 assert.match(shell,/<View style=\{styles\.storiesFixed\}>/);
 assert.doesNotMatch(shell,/active==='home'&&<View style=\{styles\.storiesFixed\}>/);
 assert.match(shell,/<NativeStories token=\{token\} actorId=\{actorId\}/);
 assert.match(strip,/for\(const story of states\.stories\)/);
 assert.match(strip,/if\(!members\.has\(story\.actorId\)\)/);
 assert.match(strip,/last\?\.photoUrl\|\|person\.photoUrl/);
 assert.match(profile,/openFamilyRealtime/);
});
test('Cold Android launch uses the real HAVANA NICE icon and branded loading screen',()=>{
 const app=JSON.parse(read('apps/android/app.json')).expo;
 const icon='../pwa/public/icons/havana-nice-512.png';
 assert.equal(app.icon,icon);
 assert.equal(app.splash.image,icon);
 assert.equal(app.splash.backgroundColor,'#0D2A23');
 assert.equal(app.android.adaptiveIcon.foregroundImage,icon);
 assert.equal(app.android.adaptiveIcon.backgroundColor,'#0D2A23');
 assert.ok(existsSync(new URL('../apps/pwa/public/icons/havana-nice-512.png',import.meta.url)));
 const shell=read('apps/android/features/chat/NativeChatSurface.tsx');
 const styles=read('apps/android/styles/chat-styles.ts');
 assert.match(shell,/restoringAccess \? <View style=\{styles\.brandedLaunch\}>/);
 assert.match(shell,/HAVANA NICE/);
 assert.match(shell,/ESPACIO DEL EQUIPO/);
 assert.match(styles,/brandedLaunch:\{flex:1,backgroundColor:'#0D2A23'/);
 assert.match(styles,/screenLaunch:\{backgroundColor:'#0D2A23',paddingBottom:0\}/);
 assert.match(shell,/restoringAccess&&styles\.screenLaunch/);
});
