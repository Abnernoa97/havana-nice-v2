import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const screens=[
  ['HOME Android','apps/android/features/home/NativeMemberHome.tsx'],
  ['HOME PWA','apps/pwa/src/app/VisualApp.tsx'],
  ['Calendario Android','apps/android/features/calendar/NativeCalendar.tsx'],
  ['Calendario PWA','apps/pwa/src/features/calendar/CalendarAccordion.tsx'],
  ['Músicos PWA','apps/pwa/src/features/musicians/MemberMusicians.tsx'],
  ['Calendario Administrador','apps/pwa/src/features/calendar/AdminCalendar.tsx'],
  ['Repertorio del músico','apps/pwa/src/features/repertoire/MemberRepertoire.tsx'],
  ['Repertorio de Administración','apps/pwa/src/features/repertoire/AdminRepertoire.tsx'],
  ['Familia del músico','apps/pwa/src/features/family/MemberFamily.tsx'],
  ['Familia de Administración','apps/pwa/src/features/family/AdminFamily.tsx']
];

test('A01: HOME lists the same modules from a single shared contract',()=>{
  const list=read('packages/shared/src/memberModules.ts');
  const ids=[...list.matchAll(/\bid:'(chat|calendar|repertoire|musicians|family|notices|settings)'/g)].map(x=>x[1]);
  assert.deepEqual(ids,['chat','calendar','repertoire','musicians','family','notices','settings']);
  assert.match(read('apps/android/features/home/NativeMemberHome.tsx'),/MEMBER_MODULES\.map/);
  assert.match(read('apps/pwa/src/app/VisualApp.tsx'),/MEMBER_MODULES/);
  assert.match(read('apps/android/app/NativeApp.tsx'),/session&&activeScreen!=='chat'&&<NativeMemberHome/);
  assert.match(read('apps/pwa/src/app/App.tsx'),/session&&activeScreen!=='chat'&&<Suspense/);
  assert.match(read('apps/pwa/src/app/App.tsx'),/<VisualApp displayName=/);
});

test('A01: only existing App shells own musician enrollment and session restoration',()=>{
  for(const [name,path] of screens){
    const source=read(path);
    assert.doesNotMatch(source,/startNamedChatSession|restoreNamedChatSession|\/api\/chat\/session|chat_single_device_owners|loginMusician|createChatSession/,name+' may not create a parallel login');
    assert.doesNotMatch(source,/new WebSocket|new DurableObject|new D1Database/,name+' must not create a separate backend');
  }
  for(const path of ['apps/android/app/NativeApp.tsx','apps/pwa/src/app/App.tsx']){
    assert.match(read(path),/startNamedChatSession\(name\.trim\(\)\)/);
    assert.match(read(path),/restoreNamedChatSession/);
  }
});

test('A02/A03: Calendar never owns Chat engine, messages or device binding',()=>{
  const calendarFiles=[
    'apps/android/features/calendar/NativeCalendar.tsx',
    'apps/pwa/src/features/calendar/CalendarAccordion.tsx',
    'apps/pwa/src/features/calendar/AdminCalendar.tsx',
    'packages/shared/src/calendar.ts',
    'cloudflare/src/modules/calendar/calendar.js'
  ];
  for(const path of calendarFiles){
    const source=read(path);
    assert.doesNotMatch(source,/chat_messages|chat_reactions|chat_single_device_owners|CHAT_ROOMS|localStorage|AsyncStorage|SQLite|WebSocket|startNamedChatSession|restoreNamedChatSession/,path+' illegally owns Chat internals');
  }
  const handler=read('cloudflare/src/modules/calendar/calendar.js');
  assert.match(handler,/verifyAdminSession/);
  assert.match(handler,/verifyMusicianSession/);
  assert.match(handler,/calendar_event_recipients/);
  assert.doesNotMatch(handler,/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+chat_/i);
  const worker=read('cloudflare/src/index.ts');
  assert.match(worker,/handleCalendarApi\(request,env,url,origin,respond,verifySession\)/);
  assert.ok(worker.includes("export {ChatRoom} from './modules/chat/chat-room.js';"));
  assert.match(read('cloudflare/src/modules/chat/chat-room.ts'),/export class ChatRoom/);
});

test('A03: Calendar UIs use shared read contract; Admin alone has writes',()=>{
  for(const path of ['apps/android/features/calendar/NativeCalendar.tsx','apps/pwa/src/features/calendar/CalendarAccordion.tsx']){
    const ui=read(path);
    assert.match(ui,/getCalendarEvents/);
    assert.doesNotMatch(ui,/adminCreateCalendarEvent|adminUpdateCalendarEvent|adminDeleteCalendarEvent/);
    assert.match(ui,/catch\(e\)/,'a failed calendar fetch must remain local');
  }
  const admin=read('apps/pwa/src/features/calendar/AdminCalendar.tsx');
  assert.match(admin,/adminCreateCalendarEvent/);
  assert.match(admin,/adminUpdateCalendarEvent/);
  assert.match(admin,/adminDeleteCalendarEvent/);
  assert.match(admin,/recipientIds/);
  assert.match(read('cloudflare/migrations/0018_calendar_events.sql'),/CREATE TABLE IF NOT EXISTS calendar_event_recipients/);
});

test('A09: independent module tests must not modify legacy or introduce a second server',()=>{
  const guard=read('scripts/audit-guard.mjs');
  const workerConfig=read('cloudflare/wrangler.jsonc');
  assert.match(guard,/Standalone V2 repository cannot include original app files/);
  assert.doesNotMatch(workerConfig,/"services"\s*:/);
  assert.match(read('.github/workflows/v2-foundation-check.yml'),/Test isolated V2 Calendar without changing live D1/);
});

test('A04: Repertoire cannot create parallel sessions or mutate Chat/Calendar content',()=>{
 for(const file of ['apps/pwa/src/features/repertoire/MemberRepertoire.tsx','apps/pwa/src/features/repertoire/AdminRepertoire.tsx',
  'packages/shared/src/repertoire.ts','cloudflare/src/modules/repertoire/repertoire.js']){
  const source=read(file);
  assert.doesNotMatch(source,/startNamedChatSession|restoreNamedChatSession|chat_messages|CHAT_ROOMS|chat_single_device_owners|localStorage|AsyncStorage|WebSocket/);
 }
 const api=read('cloudflare/src/modules/repertoire/repertoire.js');
 assert.match(api,/verifyAdminSession/);
 assert.match(api,/verifyMusicianSession/);
 assert.match(api,/calendar_event_recipients/);
 assert.doesNotMatch(api,/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+chat_/i);
 assert.doesNotMatch(api,/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+calendar_/i);
 const handler=read('cloudflare/src/index.ts');
 assert.match(handler,/handleRepertoireApi\(request,env,url,origin,respond,verifySession\)/);
 const ui=read('apps/pwa/src/features/repertoire/MemberRepertoire.tsx');
 assert.match(ui,/getAssignedEventRepertoire/);
 assert.doesNotMatch(ui,/adminCreateSong|adminDeleteSong|adminAddEventSongs/);
 assert.match(read('cloudflare/migrations/0020_repertoire.sql'),/REFERENCES calendar_events/);
});

test('Repertoire bulk reads use the shared auth and do not create circular shared imports',()=>{
 assert.doesNotMatch(read('packages/shared/src/repertoire.ts'),/from ['"]\.\/index['"]/);
 assert.match(read('packages/shared/src/repertoire.ts'),/from '\.\/api-base'/);
 assert.match(read('packages/shared/src/index.ts'),/from '\.\/api-base'/);
 const worker=read('cloudflare/src/modules/repertoire/repertoire.js');
 assert.match(worker,/WHERE r\.actor_id=\?/);
 assert.match(worker,/member\.actorId,PAGE\+1,offset/);
 assert.doesNotMatch(worker,/url\.searchParams\.get\('actorId'\)/);
});

test('Admin Repertoire refresh always updates selected event, not just the master catalog',()=>{
 const src=read('apps/pwa/src/features/repertoire/AdminRepertoire.tsx');
 assert.match(src,/const refreshAll=useCallback\(async\(\)=>\{/);
 assert.match(src,/await refresh\(\);\s*if\(eventIdRef\.current\)await refreshItems\(eventIdRef\.current\)/);
 assert.match(src,/onClick=\{\(\)=>void refreshAll\(\)\} disabled=\{busy\}>Actualizar/);
 assert.match(src,/try\{await action\(\);await refreshAll\(\);setNotice\(message\);\}/);
 assert.match(src,/const request=\+\+itemsRequest\.current/);
 assert.match(src,/request===itemsRequest\.current&&eventIdRef\.current===id/);
});

test('Familia HAVANA NICE is one isolated HOME module with existing session and no invented media',()=>{
 const share=read('packages/shared/src/memberModules.ts');
 assert.match(share,/id:'family'.*label:'Familia HAVANA NICE'/);
 assert.match(read('apps/pwa/src/app/AdminApp.tsx'),/name:'Familia HAVANA NICE'/);
 assert.match(read('apps/pwa/src/app/VisualApp.tsx'),/screen==='family'&&token\?<MemberFamily/);
 const worker=read('cloudflare/src/modules/family/family.js');
 assert.match(worker,/verifyAdminSession/);
 assert.match(worker,/verifyMusicianSession/);
 assert.match(worker,/WHERE active=1/);
 assert.doesNotMatch(worker,/INSERT INTO|UPDATE chat_|DELETE FROM|env\.R2|mockAlbum|defaultCover/);
 for(const path of ['apps/pwa/src/features/family/MemberFamily.tsx','apps/pwa/src/features/family/AdminFamily.tsx']){
  assert.doesNotMatch(read(path),/startNamedChatSession|restoreNamedChatSession|localStorage|AsyncStorage|WebSocket|\/api\/chat\/session/);
 }
});

test('Family gallery follows the One UI-inspired real-data layout and BOOK has safe navigation',()=>{
 const ui=read('apps/pwa/src/features/family/MemberFamily.tsx');
 const css=read('apps/pwa/src/styles/home/home.css');
 assert.match(ui,/className="hn-family-cover"/);
 assert.match(ui,/className="hn-family-cover-text"/);
 assert.match(ui,/className="hn-family-album-caption"/);
 assert.match(ui,/familyAlbumCount\(album\)/);
 const sharedCounts=read('packages/shared/src/family.ts');
 assert.match(sharedCounts,/export function familyAlbumCount/);
 assert.match(sharedCounts,/album\.photoCount/);
 assert.match(sharedCounts,/album\.videoCount/);
 const adminFamily=read('apps/pwa/src/features/family/AdminFamily.tsx');
 assert.match(adminFamily,/familyAlbumCount\(album\)/);
 assert.doesNotMatch(adminFamily,/function albumCount\(/);
 assert.match(ui,/setBookOpen\(true\)/);
 assert.match(ui,/<MemberBook token=\{token\} tick=\{mediaTick\}\/>/);
 assert.match(read('apps/pwa/src/features/book/BookReader.tsx'),/Todavía no hay páginas publicadas/);
 assert.match(ui,/setBookOpen\(false\)/);
 assert.match(css,/\.hn-family-cover:after\{[^}]*linear-gradient/);
 assert.match(css,/\.hn-family-album-art:after\{[^}]*linear-gradient/);
 assert.match(css,/\.hn-family-album-caption\{/);
 assert.doesNotMatch(ui,/mock|demoPhoto|samplePhoto|https:\/\/images\./i);
 assert.doesNotMatch(ui,/new PageFlip|<iframe|data:image\/|localStorage/);
 const admin=read('apps/pwa/src/features/family/AdminFamily.tsx');
 assert.match(admin,/className="a-family-cover"/);
 assert.match(admin,/<AdminBook token=\{token\} onExpired=\{onExpired\} tick=\{mediaTick\}\/>/);
 assert.match(admin,/setBookOpen\(true\)/);
 assert.match(admin,/getFamilyDirectory\(token,true\)/);
 assert.doesNotMatch(admin,/mock|demoPhoto|samplePhoto|adminUploadFamily/);
});

test('M09: four-column Familia viewer accepts only authorized Worker file grants',()=>{
 const ui=read('apps/pwa/src/features/family/FamilyMediaGallery.tsx');
 const css=read('apps/pwa/src/styles/family/gallery.css');
 const member=read('apps/pwa/src/features/family/MemberFamily.tsx');
 const admin=read('apps/pwa/src/features/family/AdminFamily.tsx');
 const shared=read('packages/shared/src/family.ts');
 assert.match(ui,/familyPrivateMediaUrl/);
 assert.match(ui,/url\.protocol!=='https:'/);
 assert.match(ui,/url\.origin!==base\.origin/);
 assert.match(ui,/\/api\/family\/media\//);
 assert.match(ui,/<dialog ref=\{modal\}/);
 assert.match(ui,/<video src=\{current\.file\} poster=\{current\.thumbnail\|\|undefined\} controls playsInline preload="metadata"/);
 assert.match(ui,/loading="lazy" decoding="async"/);
 assert.match(ui,/onKeyDown=\{handleKeys\}/);
 assert.doesNotMatch(ui,/durationLabel|durationSeconds/);
 assert.doesNotMatch(read('packages/shared/src/family.ts'),/durationSeconds/);
 const familyWorker=read('cloudflare/src/modules/family/family-media.js');
 assert.doesNotMatch(familyWorker,/export async function issueFamilyGrant\(/);
 assert.doesNotMatch(familyWorker,/typeof item==='string'/);
 assert.match(familyWorker,/export async function issueFamilyGrants/);
 assert.doesNotMatch(read('cloudflare/src/modules/family/family.js'),/book:\{title:/);
 assert.doesNotMatch(read('packages/shared/src/family.ts'),/book:\{title:/);
 assert.match(css,/hn-family-media-play-marker/);
 assert.doesNotMatch(css,/hn-family-media-duration/);
 assert.match(ui,/event\.key==='ArrowRight'/);
 assert.match(ui,/event\.key==='ArrowLeft'/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/object-fit:contain/);
 assert.match(member,/album\?\.mediaReady\?items:undefined/);
 assert.match(admin,/album\?\.mediaReady\?items:undefined/);
 assert.match(member,/<FamilyMediaGallery items=\{readyItems\}/);
 assert.match(admin,/<FamilyMediaGallery items=\{readyItems\}/);
 assert.doesNotMatch(shared,/items\?:FamilyMediaItem\[\]/);
 assert.match(shared,/getFamilyAlbumMedia\(token:string,actorId:string,admin=false\)/);
 assert.match(member,/getFamilyAlbumMedia\(token,selected\)/);
 assert.match(admin,/getFamilyAlbumMedia\(token,selected,true\)/);
 assert.match(shared,/new XMLHttpRequest\(\)/);
 assert.match(admin,/Math\.min\(2,files\.length\)/);
 assert.match(admin,/a-family-upload-progress/);
 assert.match(admin,/concurrent=files\.some\(file=>file\.type\.startsWith\('video\/'\)/);
 assert.match(admin,/Reintentar solo \{failedFiles\.length\} fallidos/);
 assert.match(admin,/uploadFailures\.map\(\(reason,index\)=>/);
 assert.match(admin,/setFailedFiles\(failures\.filter\(item=>item\.retryable\)/);
 assert.doesNotMatch(admin,/80 MiB|80 MB por archivo/);
 assert.match(admin,/storage\.warning/);
 assert.match(admin,/storage\.stopped/);
 assert.match(admin,/9\.5 GB/);
 assert.match(shared,/familyMultipartOriginal\(token,actorId,file,onProgress\)/);
 assert.doesNotMatch(shared,/80 MiB|80\*1024\*1024/);
 assert.match(admin,/createFamilyVideoPoster\(file\)/);
 assert.match(admin,/uploadFamilyVideoPoster\(token,selected!,id,blob\)/);
 assert.match(admin,/onMakePoster=\{createExistingPoster\}/);
 assert.match(ui,/Crear miniatura/);
 assert.match(shared,/uploadFamilyVideoPoster/);
 const poster=read('apps/pwa/src/services/family-video-poster.ts');
 assert.match(poster,/canvas\.toBlob/);
 assert.doesNotMatch(poster,/fetch\(|localStorage|mockPoster|sampleImage/);
 assert.match(shared,/Math\.min\(3,partCount\)/);
 assert.match(shared,/pendingFamilyUploads=new WeakMap/);
 assert.match(shared,/directFamilyIds=new WeakMap/);
 assert.match(shared,/completedParts/);
 assert.match(shared,/X-Havana-V2-Upload-ID/);
 for(const path of ['apps/pwa/src/features/family/FamilyMediaGallery.tsx','apps/pwa/src/features/family/MemberFamily.tsx','apps/pwa/src/features/family/AdminFamily.tsx']){
  const s=read(path);
  assert.doesNotMatch(s,/localStorage|AsyncStorage|new WebSocket|mockAlbum|samplePhoto|data:image\//);
 }
});

test('M10 R2: only one named private V2 media bucket binding, no Chat/Havana Cloud bridge',()=>{
 const cfg=JSON.parse(read('cloudflare/wrangler.jsonc'));
 assert.deepEqual(cfg.r2_buckets,[{binding:'MEDIA_BUCKET',bucket_name:'havana-nice-v2-media'}]);
 assert.deepEqual(cfg.d1_databases.map(x=>x.binding),['DB']);
 assert.deepEqual(cfg.durable_objects.bindings.map(x=>x.name),['CHAT_ROOMS','CALENDAR_ROOMS']);
 assert.deepEqual(cfg.durable_objects.missing||[],[]);
 assert.ok(cfg.migrations.some(x=>x.new_sqlite_classes?.includes('CalendarRoom')));
 const calendarTransport=read('cloudflare/src/modules/calendar/calendar-realtime.js');
 assert.doesNotMatch(calendarTransport,/chat_messages|chat_reactions|\.r2\.dev|localStorage/);
 assert.match(calendarTransport,/calendar\.invalidate/);
 const worker=read('cloudflare/src/index.ts');
 assert.ok(read('cloudflare/src/shared/worker-types.ts').includes('MEDIA_BUCKET?:R2Bucket'));
 assert.doesNotMatch(worker,/havana-nice-cloud|\.r2\.dev|publicBucketUrl|S3_ACCESS_KEY/);
 // R2 was enabled, but media upload routes are intentionally a separate authorization milestone.
 const family=read('cloudflare/src/modules/family/family.js');
 assert.doesNotMatch(family,/\.put\(|\.delete\(|multipart\/form-data|uploadOriginal/);
});
