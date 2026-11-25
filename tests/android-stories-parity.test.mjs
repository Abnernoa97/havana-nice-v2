import {inflateSync} from 'node:zlib';
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

test('Only native HOME keeps the team story strip pinned, with Story API fallback',()=>{
 const shell=read('apps/android/app/NativeMemberHome.tsx');
 const strip=read('apps/android/features/stories/NativeStories.tsx');
 const profile=read('apps/android/features/profile/useNativeMemberProfile.ts');
 assert.match(shell,/useNativeMemberProfile\(token,actorId,true\)/);
 assert.match(shell,/<View style=\{\[styles\.storiesFixed,!isHome&&styles\.hiddenStories\]\}/);
 assert.match(shell,/hiddenStories:\{display:'none'\}/);
 assert.match(shell,/const isHome=active==='home'/);
 assert.match(shell,/<Text accessibilityRole="header" style=\{\[styles\.moduleTitle/);
 assert.doesNotMatch(shell,/compactTop|compactAvatar/);
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

test('Native unread state badges persist by musician and disappear after an actual photo loads',()=>{
 const strip=read('apps/android/features/stories/NativeStories.tsx');
 const viewer=read('apps/android/features/stories/NativeStoryViewer.tsx');
 const seen=read('apps/android/features/stories/native-story-seen-store.ts');
 assert.match(strip,/!seenIds\.has\(st\.id\)/);
 assert.match(strip,/person\.actorId===actorId\?0/);
 assert.match(strip,/NUEVOS · \{count\}/);
 assert.match(strip,/onViewed=\{markViewed\}/);
 assert.match(viewer,/onViewed\(current\.id\)/);
 assert.match(seen,/expo-sqlite\/kv-store/);
 assert.match(seen,/getItemSync/);
 assert.match(seen,/setItemSync/);
 assert.doesNotMatch(strip,/>ESTADO<\/Text>/);
});

test('Story track remains 3dp even inside a taller tap target and no solid top slab',()=>{
 const v=read('apps/android/features/stories/NativeStoryViewer.tsx');
 assert.match(v,/progressTouch:\{flex:1,height:16,justifyContent:'center'\}/);
 assert.match(v,/progressTrack:\{width:'100%',height:3,/);
 assert.doesNotMatch(v,/progressTrack:\{flex:1/);
 assert.match(v,/complete:\{width:'100%',height:3,/);
 assert.match(v,/source=\{\{uri:TOP_FADE\}\}/);
});
test('Institutional header is permanent outside Chat, with PWA gradients and native motion',()=>{
 const shell=read('apps/android/app/NativeMemberHome.tsx');
 const motion=read('apps/android/features/shared/NativeEmeraldMotion.tsx');
 const header=shell.slice(shell.indexOf(' const header='),shell.indexOf(' const content='));
 assert.match(header,/<NativeHeaderLight\/>/);
 assert.match(header,/>HAVANA NICE<\/Text>/);
 assert.match(header,/>ESPACIO DEL EQUIPO<\/Text>/);
 assert.match(header,/\{displayName\}/);
 assert.doesNotMatch(header,/isHome|moduleTitle/);
 const light=motion.slice(motion.indexOf('export function NativeHeaderLight'),motion.indexOf('export function NativeButtonLight'));
 assert.match(light,/useMotion\(5300,reduced\)/);
 assert.equal((light.match(/<Animated\.Image/g)||[]).length,1);
 assert.doesNotMatch(light,/HEADER_STREAK|HEADER_GRADIENT|rotate:/);
 assert.match(light,/width:glowWidth,height:glowHeight/);
 assert.match(light,/outputRange:\[0,\.55,\.88,\.55,0\]/);
 assert.match(motion,/useNativeDriver:true,isInteraction:false/);
 for(const p of ['calendar/NativeCalendar','repertoire/NativeRepertoire'])assert.match(read('apps/android/features/'+p+'.tsx'),/<NativeButtonLight/);
});
test('One native player for Chat and Family hides controls on play, restores on tap, never on swipe',()=>{
 const film=read('apps/android/features/shared/NativeMediaFilm.tsx');
 assert.match(film,/player.play\(\);setControlsVisible\(false\)/);
 assert.match(film,/!error&&controlsVisible&&<Pressable/);
 assert.match(film,/ready&&!error&&controlsVisible&&<View style=\{s.transport\}>/);
 assert.match(film,/if\(!tapMoved.current\)setControlsVisible\(v=>player\.playing\?!v:true\)/);
 assert.match(film,/player.addListener\('playToEnd'/);
 assert.match(film,/videoTap:\{position:'absolute',top:0,right:0,bottom:0,left:0,zIndex:1\}/);
 assert.doesNotMatch(film,/StyleSheet\.absoluteFillObject/);
 for(const p of ['chat/NativeChatGallery','chat/NativeChatVideo','family/NativeFamily']){
  const view=read('apps/android/features/'+p+'.tsx');
  assert.match(view,/<NativeMediaFilm/);
  assert.doesNotMatch(view,/useVideoPlayer/);
 }
 assert.match(read('apps/android/features/chat/NativeChatGallery.tsx'),/Math.abs\(dx\)>55&&Math.abs\(dx\)>Math.abs\(dy\)\*1.2/);
 const family=read('apps/android/features/family/NativeFamily.tsx');
 assert.match(family,/onControlsChange=\{setFilmChrome\}/);
 assert.match(family,/chosen\?\.kind!=='video'&&<View style=\{styles\.modalNav\}/);
 assert.match(read('apps/android/features/chat/NativeChatGallery.tsx'),/onControlsChange=\{setFilmChrome\}/);
 assert.match(family,/<NativeAlbumGradient\/>/);
 assert.match(family,/<NativeAlbumShade\/>/);
 assert.doesNotMatch(family,/pauseVideo:/);
});

test('Seven native gradient textures contain valid RGBA pixels, with feathered transparent glints',()=>{
 const motion=read('apps/android/features/shared/NativeEmeraldMotion.tsx');
 const images=[...motion.matchAll(/const (\w+)='data:image\/png;base64,([^']+)'/g)];
 assert.equal(images.length,7);
 for(const [,name,encoded] of images){
  const b=Buffer.from(encoded,'base64');
  assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const w=b.readUInt32BE(16),h=b.readUInt32BE(20);
  assert.equal(b[24],8);assert.equal(b[25],6);
  const chunks=[];
  for(let at=8;at<b.length;){
   const n=b.readUInt32BE(at);if(b.toString('ascii',at+4,at+8)==='IDAT')chunks.push(b.subarray(at+8,at+8+n));
   at+=n+12;
  }
  const pixels=inflateSync(Buffer.concat(chunks));
  assert.equal(pixels.length,h*(w*4+1),name);
  if(/BLOOM|STREAK|SHEEN/.test(name)){
   const middle=Math.floor(h/2)*(w*4+1);
   assert.equal(pixels[middle+4],0,name+' left edge');
   assert.equal(pixels[middle+4*w],0,name+' right edge');
   assert.ok(pixels[middle+Math.floor(w/2)*4+4]>20,name+' visible center');
   if(name==='HEADER_BLOOM'){
    for(let y=0;y<h;y++){
     const row=y*(w*4+1);
     assert.equal(pixels[row+4],0);assert.equal(pixels[row+4*w],0);
    }
    for(let x=0;x<w;x++){
     assert.equal(pixels[x*4+4],0);assert.equal(pixels[(h-1)*(w*4+1)+x*4+4],0);
    }
   }
  }
 }
});
