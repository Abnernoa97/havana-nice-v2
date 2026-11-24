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
test('Family uses the direct proven JPEG path; private thumbnail reducer cannot hold the gallery',()=>{
 const thumbnail=read('apps/pwa/src/features/shared/PrivateThumbnail.tsx');
 const family=read('apps/pwa/src/features/family/MemberFamily.tsx');
 const gallery=read('apps/pwa/src/features/family/FamilyMediaGallery.tsx');
 assert.match(thumbnail,/const shown=local&&cached\?cached\.url:remote/);
 assert.match(thumbnail,/window\.requestIdleCallback/);
 assert.match(family,/className="hn-family-cover-photo" src=\{cover\}/);
 assert.match(gallery,/<img src=\{item\.thumbnail\}/);
 assert.match(gallery,/loading=\{index<6\?'eager':'lazy'\}/);
 assert.doesNotMatch(family,/predecoded|warmThumbnails/);
 assert.doesNotMatch(gallery,/PrivateThumbnail|canvas|IndexedDB/);
});
test('Header avatar, story fallbacks and Audio use the same cache without merging data owners',()=>{
 const avatar=read('apps/pwa/src/features/profile/PrivateProfileAvatar.tsx');
 const member=read('apps/pwa/src/features/stories/MemberStories.tsx');
 const audio=read('apps/pwa/src/features/audio/MemberAudio.tsx');
 const main=read('apps/pwa/src/app/VisualApp.tsx');
 assert.match(avatar,/cacheKey=\{"profile:"\+\(actorId\|\|name\)\}/);
 assert.match(member,/profiles=\{profiles\} token=\{token\}/);
 assert.match(audio,/cacheKey=\{"audio-cover:"\+current\.id\}/);
 assert.match(audio,/cacheKey=\{"audio-cover:"\+track\.id\}/);
 assert.match(main,/const CalendarAccordion=lazy/);
 assert.match(main,/const MemberRepertoire=lazy/);
 assert.doesNotMatch(audio,/setPreparedCovers|prepareAudioCover|new WebSocket|localStorage|document\.createElement\('canvas'\)/);
});
test('Revoked/moved PWA session purges encrypted local cache while Android remains unchanged',()=>{
 const chat=read('apps/pwa/src/features/chat/PwaChatSurface.tsx');
 assert.match(chat,/prior&&prior!==session\?\.token/);
 assert.match(chat,/clearPrivateImagesForToken\(prior\)/);
 const avatar=read('apps/pwa/src/features/profile/usePwaMemberProfiles.ts');
 assert.match(avatar,/await deletePrivateImage\(token,'profile:'\+actorId\)/);
});
