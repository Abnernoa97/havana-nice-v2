import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Audio is an independent module, not another Chat or voice recorder',()=>{
 const meta=read('packages/shared/src/memberModules.ts');
 const worker=read('cloudflare/src/index.ts');
 const chat=read('apps/android/features/chat/NativeChatSurface.tsx');
 const quota=read('cloudflare/src/modules/family/family-quota.js');
 assert.match(meta,/id:'audio',label:'Audio'/);
 assert.match(worker,/handleAudioApi\(request,env,url,origin,verifySession,ctx\)/);
 assert.match(worker,/handleChatMedia/);
 assert.match(chat,/session&&<NativeAudio token=\{session.token\}/);
 assert.match(quota,/AUDIO_SQL/);
 assert.match(quota,/AUDIO_DELETE_SQL/);
 assert.doesNotMatch(read('cloudflare/src/modules/audio/audio.js'),
  /startNamedChatSession|createSession\(|env\.CHAT_ROOMS\.get\(/);
});
test('PWA uses artwork from R2 and HTML media session without mock songs',()=>{
 const pwa=read('apps/pwa/src/features/audio/MemberAudio.tsx');
 const admin=read('apps/pwa/src/features/audio/AdminAudio.tsx');
 const metadata=read('apps/pwa/src/features/audio/audio-tags.ts');
 const shared=read('packages/shared/src/audio.ts');
 const shell=read('apps/pwa/src/app/VisualApp.tsx');
 assert.match(pwa,/new MediaMetadata/);
 assert.match(pwa,/current\.coverUrl/);
 assert.match(pwa,/onTimeUpdate=/);
 assert.match(pwa,/onDurationChange=/);
 assert.match(pwa,/previoustrack/);
 assert.match(admin,/detectAudioTags\(next\)/);
 assert.match(admin,/uploadAudioCover/);
 assert.match(metadata,/name==='APIC'/);
 assert.match(metadata,/file\.slice\(0,2\*1024\*1024\)/);
 assert.match(shared,/privateAudioUrl/);
 assert.match(shell,/MemberAudio token=\{token\} active=\{screen==='audio'\|\|screen==='home'\}/);
 assert.match(pwa,/hn-audio-vinyl is-playing/);
 const thumbnail=read('apps/pwa/src/features/shared/PrivateThumbnail.tsx');
 const proxy=read('functions/api/audio/artwork/[token].js');
 assert.match(pwa,/PrivateThumbnail/);
 assert.match(pwa,/const remoteCover=art\(current\.coverUrl\)/);
 assert.match(pwa,/new URL\('\/api\/audio\/artwork\/'\+token,window\.location\.origin\)/);
 assert.match(pwa,/artwork:artworkUrl\?\[\{src:artworkUrl\}\]:\[\]/);
 assert.match(pwa,/current\?\.coverUrl,current\?\.title,current\?\.artist,current\?\.album/);
 assert.match(pwa,/\},\[selected,tracks\.length\]\);/);
 assert.match(pwa,/recoverMedia/);
 assert.match(pwa,/recoveryTried/);
 assert.match(pwa,/onLoadedMetadata=/);
 assert.match(thumbnail,/const shown=local&&cached\?cached\.url:remote/);
 assert.match(thumbnail,/window\.requestIdleCallback/);
 assert.match(thumbnail,/URL\.revokeObjectURL\(blobUrl\)/);
 assert.match(thumbnail,/return <img ref=\{imageRef\}/);
 assert.match(proxy,/CAPABILITY=\/\^\[a-f0-9\]\{32\}\$\//);
 assert.match(proxy,/BACKEND\+'\/api\/audio\/media\/'\+token/);
 assert.match(proxy,/private,no-store/);
 assert.match(proxy,/image\/jpeg/);
 assert.match(proxy,/onRequestGet/);
 assert.match(proxy,/onRequestHead/);

 assert.match(pwa,/onPlay=\{\(\)=>\{requestedPlay\.current=true;setBuffering\(true\);\}\}/);
 assert.match(pwa,/onPlaying=\{\(\)=>\{requestedPlay\.current=true;setPlaying\(true\);setBuffering\(false\);\}\}/);
 assert.match(pwa,/onWaiting=\{\(\)=>\{setPlaying\(false\);setBuffering\(true\);\}\}/);
 assert.doesNotMatch(pwa,/onWaiting=\{\(\)=>setPlaying\(false\)\}/);
 const css=read('apps/pwa/src/features/audio/audio-player.css');
 const html=read('apps/android/features/audio/nativeAudioEditorialHtml.ts');
 assert.match(css,/\.hn-audio-vinyl\.is-playing\{animation-play-state:running/);
 assert.match(css,/hn-audio-parchment/);
 assert.match(css,/url\('\/audio-lounge\/tear\.webp'\)/);
 assert.match(css,/url\('\/audio-lounge\/floral-clean\.webp'\)/);
 assert.match(css,/url\('\/audio-lounge\/corner\.webp'\)/);
 // The approved artwork is still used. Earlier procedural versions of these
 // same details were unconditionally overridden and must not return.
 assert.doesNotMatch(css,/clip-path:polygon\(0 28px/);
 assert.doesNotMatch(css,/repeating-linear-gradient\(165deg/);
 assert.doesNotMatch(css,/height:clamp\(260px,52vw,390px\)/);
 assert.doesNotMatch(css,/width:min\(76%,290px\)/);
 assert.match(css,/animation:hn-vinyl-turn 6s linear infinite;\s*animation-play-state:paused/);
 assert.doesNotMatch(css,/hn-audio-vinyl-grooves/);
 assert.doesNotMatch(pwa,/hn-audio-vinyl-grooves|hn-audio-silk|hn-audio-fold/);
 for(const asset of ['tear','floral','floral-clean','corner']){
  const bytes=readFileSync(new URL('../apps/pwa/public/audio-lounge/'+asset+'.webp',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.ok(bytes.length>600&&bytes.length<20000);
 }
 assert.match(html,/havana-nice-v2\.pages\.dev\/audio-lounge\/floral-clean\.webp/);
 assert.match(css,/\.hn-audio-parchment:before\{/);
 assert.match(css,/\.hn-audio-flowers\{[\s\S]*?-webkit-mask-image:none/);
 assert.match(css,/\.hn-home-route \.hn-audio-editorial\{max-width:none;position:relative;z-index:1;margin-top:0\}/);
 assert.doesNotMatch(css,/margin-top:-(?:12|18|20)px/);
 const homeStage=read('apps/pwa/src/features/home/home-stage.css');
 assert.match(homeStage,/\.hn-moments-strip\{[\s\S]*?padding:3px 0 4px\}/);
 assert.match(homeStage,/\.hn-moments-wrap\{width:100%;padding:2px 0 0\}/);
 assert.doesNotMatch(homeStage,/\.hn-home-route \.hn-moments-wrap\{padding-top:2px\}/);
 assert.doesNotMatch(homeStage,/true four-zone mobile layout/);
 assert.match(homeStage,/\.hn-home-route \.hn-home-stage\{[\s\S]*?position:relative;top:auto;flex:0 0 auto/);
 assert.match(homeStage,/\.hn-home-route \.visual-content\{background:#f7f0e8\}/);
 assert.doesNotMatch(homeStage,/\.hn-home-audio-scroll \.hn-audio-editorial\{margin-top:0\}/);
 assert.match(homeStage,/\.hn-home-route \.hn-home-audio-scroll\{/);
 assert.match(homeStage,/overflow-x:hidden;overflow-y:auto/);
 assert.match(homeStage,/\.hn-home-route \.hn-home-stage:after\{[\s\S]*?linear-gradient/);
 assert.match(shell,/className=\{screen==='home'\?'visual-content hn-home-viewport':'visual-content'\}/);
 assert.match(shell,/screen==='home'\?'hn-home-audio-scroll':'hn-audio-route-slot'/);
 assert.doesNotMatch(homeStage,/\.hn-home-route \.hn-audio-paper-tear[\s\S]{0,100}display:none!important/);
 const homeStyles=read('apps/pwa/src/styles/home/home.css');
 assert.doesNotMatch(homeStyles,/html:has\(\.hn-home-route\)/);
 assert.match(homeStyles,/\.visual-bottom-nav\{position:fixed;bottom:0/);

 assert.match(html,/Stories and lounge touch/);
 assert.match(html,/renderHavanaAudio/);
 assert.match(pwa,/hn-audio-paper-tear/);
 assert.match(pwa,/hn-audio-flower/);
 assert.doesNotMatch(pwa+shared,/https?:\/\/(?:example\.com|music\.mp3|testaudio)/);
});
test('Android OS player uses the same cover and MediaSession with audio background enabled',()=>{
 const native=read('apps/android/features/audio/NativeAudio.tsx');
 const app=JSON.parse(read('apps/android/app.json'));
 assert.match(native,/setActiveForLockScreen\(true/);
 assert.match(native,/artworkUrl:privateAudioUrl\(current\.coverUrl\)/);
 assert.match(native,/setAudioModeAsync/);
 assert.match(native,/shouldPlayInBackground:true/);
 assert.match(native,/getAudioTracks\(token,false,force\)/);
 assert.match(native,/onRequestClose=\{onClose\}/);
 const visual=read('apps/android/features/audio/NativeAudioEditorialView.tsx');
 const bridge=read('apps/android/features/audio/nativeAudioStore.ts');
 const layout=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(native,/publishNativeAudio/);
 assert.match(native,/useAudioPlaylist/);
 assert.match(visual,/NATIVE_AUDIO_EDITORIAL_HTML/);
 assert.match(visual,/sendNativeAudioCommand/);
 assert.match(bridge,/useSyncExternalStore/);
 assert.match(layout,/<NativeAudioEditorialView inline\/>/);
 assert.match(layout,/\{header\}/);
 assert.match(layout,/styles\.storiesFixed/);
 assert.match(layout,/<View style=\{styles\.storiesFixed\}>/);
 assert.doesNotMatch(layout,/active==='home'&&<View style=\{styles\.storiesFixed\}>/);
 const audio=app.expo.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-audio');
 assert.equal(audio[1].enableBackgroundPlayback,true);
 const batch=JSON.parse(read('releases/android-batch.json'));
 assert.equal(app.expo.version,batch.version,'Native version must match the explicitly approved signed batch');
 assert.equal(app.expo.android.versionCode,batch.versionCode);
});

test('Private Audio cache is short-lived, member-bound and bypassable',async()=>{
 const source=read('packages/shared/src/audio.ts');
 assert.match(source,/const AUDIO_CATALOG_CACHE_MS=2\*60\*1000/);
 assert.match(source,/clearAudioTracksCache/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|AsyncStorage/);
 const workerImport="import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';";
 assert.ok(source.includes(workerImport));
 const js=ts.transpileModule(source.replace(workerImport,
  "const API='https://audio-test.example';"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 let now=100000;
 const requests=[];
 const fakeDate={now:()=>now};
 const replies=async(url,options)=>{
  const authorization=options.headers.Authorization;
  requests.push({url,authorization});
  const actor=authorization.split(' ').at(-1);
  if(actor==='revoked')return new Response(JSON.stringify({error:'No autorizado'}),{
   status:401,headers:{'Content-Type':'application/json'}
  });
  return new Response(JSON.stringify({tracks:[{
   id:actor,title:actor,artist:'HAVANA NICE',album:'Audio',position:1,
   sizeBytes:400,hasCover:false,audioUrl:'/api/audio/media/'+('a'.repeat(32)),coverUrl:null
  }]}),{status:200,headers:{'Content-Type':'application/json'}});
 };
 const module={exports:{}};
 new Function('exports','fetch','Date',js)(module.exports,replies,fakeDate);
 const {getAudioTracks,clearAudioTracksCache}=module.exports;
 const original=await getAudioTracks('noa');
 assert.equal(original[0].id,'noa');
 assert.equal((await getAudioTracks('noa'))[0].id,'noa');
 assert.equal(requests.length,1,'Warm same-member opens should not issue new capabilities');
 assert.equal((await getAudioTracks('noa',false,true))[0].id,'noa');
 assert.equal(requests.length,2,'Manual refresh must bypass cache');
 assert.equal((await getAudioTracks('fer'))[0].id,'fer');
 assert.equal(requests.length,3,'A second member must not reuse the first member grants');
 assert.equal((await getAudioTracks('noa'))[0].id,'noa');
 assert.equal(requests.length,4,'Changing member invalidates the prior cache');
 now+=120001;
 await getAudioTracks('noa');
 assert.equal(requests.length,5,'Expired client cache must renew before server grant expiration');
 clearAudioTracksCache('noa');
 await getAudioTracks('noa');
 assert.equal(requests.length,6,'Logout must clear cached capabilities');
 await assert.rejects(getAudioTracks('revoked'),{name:'AudioApiError',status:401});
 await assert.rejects(getAudioTracks('revoked'),{name:'AudioApiError',status:401});
 assert.equal(requests.length,8,'Auth failures must not be cached');
 await getAudioTracks('noa',true);
 await getAudioTracks('noa',true);
 assert.equal(requests.length,10,'Admin must always fetch live catalog');
 const pwa=read('apps/pwa/src/features/audio/MemberAudio.tsx');
 const native=read('apps/android/features/audio/NativeAudio.tsx');
 assert.match(pwa,/getAudioTracks\(token,false,true\)/);
 assert.match(pwa,/onClick=\{\(\)=>void refresh\(true\)\}/);
 assert.match(native,/refresh:\(\)=>\{void refresh\(true\);\}/);
 assert.match(pwa,/clearAudioTracksCache\(token\)/);
 assert.match(native,/clearAudioTracksCache\(token\)/);
});

test('Two concurrent member Audio loads share exactly one live request',async()=>{
 const source=read('packages/shared/src/audio.ts');
 const workerImport="import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';";
 const js=ts.transpileModule(source.replace(workerImport,
  "const API='https://audio-test.example';"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 let calls=0,resolveRequest;
 const fetchOnce=()=>{calls++;return new Promise(resolve=>{resolveRequest=resolve;});};
 const module={exports:{}};
 new Function('exports','fetch','Date',js)(module.exports,fetchOnce,Date);
 const first=module.exports.getAudioTracks('noa');
 const second=module.exports.getAudioTracks('noa');
 assert.equal(calls,1);
 resolveRequest(new Response(JSON.stringify({tracks:[]}),{status:200}));
 assert.deepEqual(await first,[]);
 assert.deepEqual(await second,[]);
 assert.equal(calls,1);
});

test('Audio remounts on member credential changes without retaining the prior member UI',()=>{
 const shell=read('apps/pwa/src/app/VisualApp.tsx');
 const native=read('apps/android/features/chat/NativeChatSurface.tsx');
 assert.match(shell,/MemberAudio token=\{token\}[\s\S]{0,100}key=\{token\}/);
 assert.match(native,/NativeAudio token=\{session\.token\} key=\{session\.token\}/);
});

test('HOME keeps the story strip stationary while only Audio moves, in PWA and Android',()=>{
 const shell=read('apps/pwa/src/app/VisualApp.tsx');
 const stage=read('apps/pwa/src/features/home/home-stage.css');
 const frame=read('apps/pwa/src/styles/home/home.css');
 const native=read('apps/android/app/NativeMemberHome.tsx');
 const book=read('apps/android/features/book/NativeBook.tsx');
 assert.match(shell,/hn-home-viewport/);
 assert.match(shell,/hn-home-audio-scroll/);
 assert.match(stage,/\.hn-home-route \.visual-layout>\.hn-home-viewport\{[\s\S]*?overflow:hidden/);
 assert.match(stage,/\.hn-home-route \.hn-home-stage\{[\s\S]*?flex:0 0 auto/);
 assert.match(stage,/\.hn-home-route \.hn-home-audio-scroll\{[\s\S]*?overflow-x:hidden;overflow-y:auto/);
 assert.match(stage,/\.hn-home-route \.hn-home-stage:after\{[\s\S]*?pointer-events:none/);
 assert.match(stage,/rgba\(255,255,255,0\) 100%/);
 assert.match(frame,/\.visual-bottom-nav\{position:fixed;bottom:0/);
 assert.match(native,/<View style=\{styles\.storiesFixed\}>/);
 assert.doesNotMatch(native,/active==='home'&&<View style=\{styles\.storiesFixed\}>/);
 assert.match(native,/source=\{\{uri:STORIES_FADE\}\}/);
 assert.match(native,/storiesFade:\{position:'absolute',left:0,right:0,bottom:-29,height:36/);
 assert.match(native,/<ScrollView style=\{styles\.root\} contentContainerStyle=\{styles\.content\}/);
 assert.match(native,/accessibilityRole="tablist"/);
 assert.match(book,/PageFlip|book/);
});

test('iPhone Audio starts on the real user gesture and never shows a false red autoplay warning',()=>{
 const pwa=read('apps/pwa/src/features/audio/MemberAudio.tsx');
 const cover=read('apps/pwa/src/features/shared/PrivateThumbnail.tsx');
 assert.match(pwa,/const playTrack=\(position:number\)=>\{/);
 assert.match(pwa,/audio\.preload='auto';audio\.src=url;/);
 assert.match(pwa,/setSelected\(position\);\s*void audio\.play\(\)/);
 assert.match(pwa,/error\.name==='NotAllowedError'\|\|error\.name==='AbortError'/);
 assert.match(pwa,/if\(audio\.src!==url\)return/);
 assert.match(pwa,/void recoverMedia\(track\.id\)/);
 assert.match(pwa,/if\(ref\.current\?\.src!==failedUrl\)return/);
 assert.doesNotMatch(pwa,/Toca reproducir para escuchar el audio/);
 assert.match(pwa,/\{!!error&&!current&&<p className="hn-audio-error"/);
 assert.match(pwa,/aria-busy=\{isBuffering\}/);
 assert.match(pwa,/onClick=\{\(\)=>\{if\(i!==selected\)playTrack\(i\);else toggle\(\);\}\}/);
 assert.match(pwa,/preload="metadata"/);
 assert.match(pwa,/cacheKey=\{"audio-cover:"\+current\.id\}/);
 assert.match(pwa,/cacheKey=\{"audio-cover:"\+track\.id\}/);
 assert.doesNotMatch(pwa,/setPreparedCovers\(\{\}\)/);
 assert.doesNotMatch(cover,/localStorage|sessionStorage/);
});

test('iPhone HOME locks only the page shell, preserving independent Audio scroll and STORY overlays',()=>{
 const view=read('apps/pwa/src/app/VisualApp.tsx');
 const home=read('apps/pwa/src/styles/home/home.css');
 const stage=read('apps/pwa/src/features/home/home-stage.css');
 assert.match(view,/useLayoutEffect\(\(\)=>\{/);
 assert.match(view,/if\(screen!=='home'\)return/);
 assert.match(view,/document\.documentElement\.classList\.add\('hn-home-viewport-lock'\)/);
 assert.match(view,/document\.body\.classList\.remove\('hn-home-viewport-lock'\)/);
 assert.match(home,/body\.hn-home-viewport-lock\{[\s\S]*?position:fixed;inset:0/);
 assert.match(home,/\.hn-home-viewport-lock \.hn-home-route\{[\s\S]*?padding-top:env\(safe-area-inset-top\)/);
 assert.match(stage,/\.hn-home-route \.hn-home-audio-scroll\{[\s\S]*?overflow-x:hidden;overflow-y:auto/);
 assert.doesNotMatch(home,/html:has\(\.hn-home-route\)/);
 const story=read('apps/pwa/src/features/stories/MemberStories.tsx');
 assert.match(story,/createPortal\(/);
});

test('Audio editorial CSS keeps one top-level rule per selector',()=>{
 const source=read('apps/pwa/src/features/audio/audio-player.css');
 const masked=source.replace(/\/\*[\s\S]*?\*\//g,part=>' '.repeat(part.length));
 const seen=new Map();
 let depth=0,start=0;
 for(let i=0;i<masked.length;i++){
  if(masked[i]==='{'){
   const selector=masked.slice(start,i).trim();
   if(depth===0&&!selector.startsWith('@')){
    seen.set(selector,(seen.get(selector)||0)+1);
   }
   depth++;start=i+1;
  }else if(masked[i]==='}'){
   depth--;assert.ok(depth>=0,'Unbalanced CSS braces');
   start=i+1;
  }
 }
 assert.equal(depth,0,'Unclosed CSS blocks');
 assert.ok(seen.size>=50,'Expected the actual editorial stylesheet');
 assert.deepEqual([...seen].filter(([,count])=>count>1),[],
  'Do not reintroduce layered duplicate global rules in Audio');
});

test('Native editorial Audio shares the CURRENT PWA parchment CSS, not hidden legacy decorations',()=>{
 const source=read('apps/android/features/audio/nativeAudioEditorialHtml.ts');
 const serialized=source.match(/export const NATIVE_AUDIO_EDITORIAL_HTML=("(?:\\.|[^"\\])*");?/s)?.[1];
 assert.ok(serialized,'Expected self-contained native HTML');
 const html=JSON.parse(serialized);
 const current=read('apps/pwa/src/features/audio/audio-player.css')
  .replaceAll("url('/audio-lounge/","url('https://havana-nice-v2.pages.dev/audio-lounge/");
 assert.ok(html.includes(current),'Native WebView must use the full approved PWA editorial stylesheet');
 assert.doesNotMatch(html,/class="hn-audio-fold"|class="hn-audio-silk|hn-audio-vinyl-grooves/);
 assert.match(html,/window\.renderHavanaAudio/);
 assert.match(read('apps/android/features/audio/NativeAudio.tsx'),/useAudioPlaylist\(/);
});
