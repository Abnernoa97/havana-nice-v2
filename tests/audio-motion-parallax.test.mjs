import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Vinyl alone has gyroscope perspective; the playback spin stays on the inner disc',()=>{
 const css=read('apps/pwa/src/features/audio/audio-player.css');
 assert.match(css,/\.hn-audio-record-wrap\{[\s\S]*?transform:perspective\(850px\) rotateX\(var\(--hn-disc-x\)\) rotateY\(var\(--hn-disc-y\)\)/);
 assert.match(css,/\.hn-audio-record-wrap::after\{[\s\S]*?radial-gradient\(circle at var\(--hn-disc-glare-x\) var\(--hn-disc-glare-y\)/);
 assert.match(css,/\.hn-audio-record-wrap\.hn-motion-active::after\{opacity:\.42\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/\.hn-audio-vinyl\.is-playing\{animation-play-state:running!important\}/);
 assert.match(css,/@keyframes hn-vinyl-turn/);
});

test('iPhone uses gesture-granted orientation only while the Audio player is active',()=>{
 const hook=read('apps/pwa/src/features/audio/useAudioDiscMotion.ts');
 const player=read('apps/pwa/src/features/audio/MemberAudio.tsx');
 assert.match(hook,/window\.addEventListener\('deviceorientation',handle/);
 assert.match(hook,/window\.removeEventListener\('deviceorientation',handle\)/);
 assert.match(hook,/prefers-reduced-motion: reduce/);
 assert.match(hook,/requestPermission/);
 assert.match(hook,/Math\.max\(-limit,Math\.min\(limit,value\)\)/);
 assert.match(player,/useAudioDiscMotion\(active&&!!current\)/);
 assert.match(player,/className="hn-audio-record-wrap" ref=\{discRef\}/);
 assert.match(player,/onClick=\{\(\)=>\{requestFromGesture\(\);void toggle\(\);\}\}/);
});

test('Android samples a native accelerometer only in foreground and sends bounded visual values',()=>{
 const sensor=read('apps/android/features/audio/useNativeVinylMotion.ts');
 const native=read('apps/android/features/audio/NativeAudioEditorialView.tsx');
 const full=read('apps/android/features/audio/NativeAudio.tsx');
 const pkg=JSON.parse(read('apps/android/package.json'));
 const lock=JSON.parse(read('package-lock.json'));
 assert.equal(pkg.dependencies['expo-sensors'],'~58.0.5');
 assert.equal(lock.packages['apps/android'].dependencies['expo-sensors'],'~58.0.5');
 assert.equal(lock.packages['node_modules/expo-sensors'].version,'58.0.5');
 assert.match(sensor,/Accelerometer\.isAvailableAsync\(\)/);
 assert.match(sensor,/Accelerometer\.setUpdateInterval\(80\)/);
 assert.match(sensor,/AppState\.addEventListener\('change'/);
 assert.match(sensor,/subscription\?\.remove\(\)/);
 assert.match(sensor,/onTilt\(0,0\)/);
 assert.match(native,/useNativeVinylMotion\(active&&ready,onTilt\)/);
 assert.match(native,/window\.havanaAudioTilt/);
 assert.match(full,/<NativeAudioEditorialView active=\{visible\}\/>/);
 assert.match(full,/useAudioPlaylist\(/);
});

test('Native HTML reuses precise PWA 3D CSS with an isolated numeric tilt API',()=>{
 const src=read('apps/android/features/audio/nativeAudioEditorialHtml.ts');
 const encoded=src.match(/export const NATIVE_AUDIO_EDITORIAL_HTML=("(?:\\.|[^"\\])*");?/s)?.[1];
 assert.ok(encoded,'Bundled native WebView HTML exists');
 const html=JSON.parse(encoded);
 const css=read('apps/pwa/src/features/audio/audio-player.css')
  .replaceAll("url('/audio-lounge/","url('https://havana-nice-v2.pages.dev/audio-lounge/");
 assert.ok(html.includes(css),'Native vinyl design must match PWA exactly');
 assert.match(html,/window\.havanaAudioTilt=function\(x,y\)/);
 assert.match(html,/Number\.isFinite\(x\)/);
 assert.match(html,/Math\.max\(-8,Math\.min\(8,x\)\)/);
 assert.match(html,/\.classList\.toggle\('hn-motion-active'/);
 assert.match(html,/window\.renderHavanaAudio=function/);
 assert.doesNotMatch(html,/\.measureInWindow\(/);
});
