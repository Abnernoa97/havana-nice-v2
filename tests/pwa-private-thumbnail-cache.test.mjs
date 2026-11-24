import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('iPhone PWA stores only session-encrypted bounded local thumbnails',()=>{
 const cache=read('apps/pwa/src/services/private-image-cache.ts');
 assert.match(cache,/crypto\.subtle\.encrypt\(/);
 assert.match(cache,/crypto\.subtle\.decrypt\(/);
 assert.match(cache,/AES-GCM/);
 assert.match(cache,/new TextEncoder\(\)\.encode\('havana-private-photo-v1:'\+token\)/);
 assert.match(cache,/const MAX_ENTRIES=120/);
 assert.match(cache,/const MAX_BYTES=32\*1024\*1024/);
 assert.match(cache,/expiresAt<=Date\.now\(\)/);
 assert.doesNotMatch(cache,/localStorage|sessionStorage|new WebSocket|authorization.*Bearer|CACHE_NAME/);
});
test('Album grids compress existing photos only after onLoad; no large background originals',()=>{
 const thumbnail=read('apps/pwa/src/features/shared/PrivateThumbnail.tsx');
 const family=read('apps/pwa/src/features/family/MemberFamily.tsx');
 const gallery=read('apps/pwa/src/features/family/FamilyMediaGallery.tsx');
 assert.match(thumbnail,/const scale=Math\.min\(1,480\//);
 assert.match(thumbnail,/canvas\.toBlob\(/);
 assert.match(thumbnail,/readPrivateImage\(token,cacheKey\)/);
 assert.match(thumbnail,/storePrivateImage\(token,cacheKey,blob/);
 assert.match(family,/cacheKey=\{"family-cover:"\+album\.actorId\}/);
 assert.match(gallery,/cacheKey=\{"family-thumb:"\+item\.id\}/);
 assert.match(gallery,/loading=\{index<4\?'eager':'lazy'\}/);
});
test('Header avatar, story fallbacks and Audio use the same cache without merging data owners',()=>{
 const avatar=read('apps/pwa/src/features/profile/PrivateProfileAvatar.tsx');
 const member=read('apps/pwa/src/features/stories/MemberStories.tsx');
 const audio=read('apps/pwa/src/features/audio/audio-cover-cache.ts');
 const main=read('apps/pwa/src/app/VisualApp.tsx');
 assert.match(avatar,/cacheKey=\{"profile:"\+\(actorId\|\|name\)\}/);
 assert.match(member,/profiles=\{profiles\} token=\{token\}/);
 assert.match(audio,/readPrivateImage\(token,key\)/);
 assert.match(audio,/storePrivateImage\(token,key,blob/);
 assert.match(main,/const CalendarAccordion=lazy/);
 assert.match(main,/const MemberRepertoire=lazy/);
 assert.doesNotMatch(audio,/new WebSocket|localStorage|document\.createElement\('canvas'\)/);
});
test('Revoked/moved PWA session purges encrypted local cache while Android remains unchanged',()=>{
 const chat=read('apps/pwa/src/features/chat/PwaChatSurface.tsx');
 assert.match(chat,/prior&&prior!==session\?\.token/);
 assert.match(chat,/clearPrivateImagesForToken\(prior\)/);
 const avatar=read('apps/pwa/src/features/profile/usePwaMemberProfiles.ts');
 assert.match(avatar,/await deletePrivateImage\(token,'profile:'\+actorId\)/);
});
