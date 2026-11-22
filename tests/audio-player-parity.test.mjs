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
 const cachedArtwork=read('apps/pwa/src/features/audio/audio-cover-cache.ts');
 const proxy=read('functions/api/audio/artwork/[token].js');
 assert.match(pwa,/prepareAudioCover/);
 assert.match(pwa,/const remoteCover=art\(current\.coverUrl\)/);
 assert.match(pwa,/new URL\('\/api\/audio\/artwork\/'\+token,window\.location\.origin\)/);
 assert.match(pwa,/artwork:artworkUrl\?\[\{src:artworkUrl\}\]:\[\]/);
 assert.match(pwa,/current\?\.coverUrl,current\?\.title,current\?\.artist,current\?\.album/);
 assert.match(pwa,/\},\[selected,tracks\.length\]\);/);
 assert.match(pwa,/recoverMedia/);
 assert.match(pwa,/recoveryTried/);
 assert.match(pwa,/onLoadedMetadata=/);
 assert.doesNotMatch(cachedArtwork,/canvas\.toBlob|canvas\.toDataURL|createElement\('canvas'\)/);
 assert.match(cachedArtwork,/image\.decode\(\)/);
 assert.match(cachedArtwork,/URL\.revokeObjectURL\(display\)/);
 assert.match(cachedArtwork,/URL\.createObjectURL/);
 assert.match(proxy,/CAPABILITY=\/\^\[a-f0-9\]\{32\}\$\//);
 assert.match(proxy,/BACKEND\+'\/api\/audio\/media\/'\+token/);
 assert.match(proxy,/private,no-store/);
 assert.match(proxy,/image\/jpeg/);
 assert.match(proxy,/onRequestGet/);
 assert.match(proxy,/onRequestHead/);

 assert.match(pwa,/onPlay=\{\(\)=>setPlaying\(true\)\}/);
 assert.doesNotMatch(pwa,/onWaiting=\{\(\)=>setPlaying\(false\)\}/);
 const css=read('apps/pwa/src/features/audio/audio-player.css');
 const html=read('apps/android/features/audio/nativeAudioEditorialHtml.ts');
 assert.match(css,/\.hn-audio-vinyl\.is-playing\{animation-play-state:running/);
 assert.match(css,/hn-audio-parchment/);
 assert.match(css,/url\('\/audio-lounge\/tear\.webp'\)/);
 assert.match(css,/url\('\/audio-lounge\/floral-clean\.webp'\)/);
 assert.match(css,/url\('\/audio-lounge\/corner\.webp'\)/);
 assert.match(css,/\.hn-audio-vinyl-grooves\{display:none\}/);
 for(const asset of ['tear','floral','floral-clean','corner']){
  const bytes=readFileSync(new URL('../apps/pwa/public/audio-lounge/'+asset+'.webp',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');
  assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.ok(bytes.length>600&&bytes.length<20000);
 }
 assert.match(html,/havana-nice-v2\.pages\.dev\/audio-lounge\/floral-clean\.webp/);
 assert.match(css,/\.hn-audio-parchment:before\{/);
 assert.match(css,/\.hn-audio-flowers\{[\s\S]*?-webkit-mask-image:none/);
 assert.match(css,/\.hn-home-route \.hn-audio-editorial\{position:relative;z-index:1;margin-top:-18px\}/);
 const homeStage=read('apps/pwa/src/features/home/home-stage.css');
 assert.match(homeStage,/\.hn-home-route \.hn-moments-strip\{padding-top:3px;padding-bottom:4px\}/);
 assert.doesNotMatch(homeStage,/true four-zone mobile layout/);
 assert.match(homeStage,/\.hn-home-route \.hn-home-stage\{position:sticky;top:0/);
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
 assert.match(layout,/\{active==='home'&&<View style=\{styles\.storiesFixed\}>/);
 const audio=app.expo.plugins.find(p=>Array.isArray(p)&&p[0]==='expo-audio');
 assert.equal(audio[1].enableBackgroundPlayback,true);
 assert.equal(app.expo.version,'0.0.23','do not generate an Android version bump during the feature batch');
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
