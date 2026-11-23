import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Family cards are compact and member cover is cinematic 16:9 on both platforms',()=>{
 const css=read('apps/pwa/src/styles/home/home.css');
 const native=read('apps/android/features/family/NativeFamily.tsx');
 assert.match(css,/\.hn-family-album-art\{aspect-ratio:1\/1;min-height:0\}/);
 assert.match(css,/\.hn-family-cover\{min-height:0;aspect-ratio:16\/9/);
 assert.match(native,/album:\{width:'48%',aspectRatio:1/);
 assert.match(native,/hero:\{width:'100%',aspectRatio:16\/9/);
});
test('Admin can set a real selected photo directly from thumbnails without new storage services',()=>{
 const admin=read('apps/pwa/src/features/family/AdminFamily.tsx');
 const gallery=read('apps/pwa/src/features/family/FamilyMediaGallery.tsx');
 const backend=read('cloudflare/src/modules/family/family-media.js');
 assert.match(admin,/onSetCover=\{id=>changeFile\(id,'cover'\)\}/);
 assert.match(gallery,/className="hn-family-choose-cover"/);
 assert.match(gallery,/onClick=\{\(\)=>void onSetCover\(item.id\)\}/);
 assert.match(backend,/export async function selectFamilyCover/);
 assert.match(backend,/UPDATE family_media SET is_cover=1/);
});
test('Family prewarms private album metadata, refreshes without blanking and does not share credentials',()=>{
 const member=read('apps/pwa/src/features/family/MemberFamily.tsx');
 const native=read('apps/android/features/family/NativeFamily.tsx');
 assert.match(member,/const albumCache=useRef/);
 assert.match(member,/cacheEpoch\.current===epoch/);
 assert.match(member,/loadCached\(item.actorId\)/);
 assert.match(member,/itemsActor===selected/);
 assert.match(native,/const albumCache=useRef/);
 assert.match(native,/Image\.prefetch\(thumbnail\)/);
 assert.match(native,/data=\{mediaLoading&&!ready\.length\?\[\]:ready\}/);
 assert.doesNotMatch(member+native,/localStorage|CacheStorage|IndexedDB|new WebSocket/);
});
