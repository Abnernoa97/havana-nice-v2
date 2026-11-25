// Runtime regression: free-form Calendar dates must NEVER render "Invalid Date".
// This uses the real shared Calendar implementation, not a duplicated test parser.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const shared=read('packages/shared/src/calendar.ts');
const compiled=ts.transpileModule(shared,{
 fileName:'calendar.ts',
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
});
const exported={};
// Shared Calendar now imports the same canonical API base as other modules.
// Provide that export to the isolated Node VM (never a second runtime URL).
runInNewContext(compiled.outputText,{exports:exported,URL,Date,Intl,fetch,Error,Number,String,RegExp,
 require(id){
  assert.equal(id,'./api-base');
  return {HAVANA_V2_DEV_API_BASE_URL:'https://havana-nice-v2-dev.soloaplicaciones97.workers.dev'};
 }});
const {calendarDate,calendarSortDate,sortCalendarEvents,safeCalendarMapUrl}=exported;

test('completed-event stamp uses the venue date only after local midnight and never on cancelled dates',()=>{
 const {calendarEventCompleted}=exported;
 const input={dateSort:'2026-11-07',timeZone:'America/Mexico_City',status:'confirmed'};
 assert.equal(calendarEventCompleted(input,new Date('2026-11-08T02:00:00Z')),false,
  'Nov 7 in Mexico City must not be stamped before local midnight');
 assert.equal(calendarEventCompleted(input,new Date('2026-11-08T07:00:00Z')),true);
 assert.equal(calendarEventCompleted({...input,status:'cancelled'},new Date('2026-11-08T07:00:00Z')),false);
 assert.equal(calendarEventCompleted({...input,dateSort:null},new Date('2026-11-08T07:00:00Z')),false);
});
test('free-form event dates are shown exactly as entered by the Administrator',()=>{
 for(const value of ['14dic26','14 de dic. 2026','14/11/2026','Por definir','#A · 21:30','Mayo? 2027','😎 viernes']){
  assert.equal(calendarDate(value),value,'date '+value);
  assert.doesNotMatch(calendarDate(value),/Invalid Date|NaN|undefined/);
 }
 assert.equal(calendarDate(''),'Fecha por definir');
});

test('valid ISO dates are formatted, but invalid calendar dates do not turn into Invalid Date',()=>{
 const iso=calendarDate('2026-11-14');
 assert.match(iso,/14/);
 assert.match(iso,/noviembre/i);
 assert.doesNotMatch(iso,/Invalid Date|NaN/);
 assert.equal(calendarDate('2026-02-30'),'2026-02-30');
 assert.equal(calendarDate('2026-13-14'),'2026-13-14');
});

test('Google Maps text is stored/displayed freely but only safe HTTPS URLs are clickable',()=>{
 assert.equal(safeCalendarMapUrl('https://maps.google.com/?q=Mexico'),'https://maps.google.com/?q=Mexico');
 assert.equal(safeCalendarMapUrl('javascript:alert(1)'),null);
 assert.equal(safeCalendarMapUrl('Lugar #3 y calle 22'),null);
});

test('Admin, PWA and native Calendar all use the same shared date function',()=>{
 const paths=['apps/pwa/src/features/calendar/AdminCalendar.tsx','apps/pwa/src/features/calendar/CalendarAccordion.tsx',
  'apps/android/features/calendar/NativeCalendar.tsx'];
 for(const p of paths){
  const source=read(p);
  assert.match(source,/calendarDate\(item\.date\)/,p);
  assert.doesNotMatch(source,/new Date\(item\.date\)|Date\.parse\(item\.date\)|Invalid Date/,p);
 }
 const pwa=read('apps/pwa/src/features/calendar/CalendarAccordion.tsx');
 const native=read('apps/android/features/calendar/NativeCalendar.tsx');
 assert.match(pwa,/safeCalendarMapUrl\(item\.mapUrl\)/);
 assert.match(native,/safeCalendarMapUrl\(item\.mapUrl\)/);
});

test('Admin Calendar mounts event photo editors only for the expanded date',()=>{
 const src=read('apps/pwa/src/features/calendar/AdminCalendar.tsx');
 assert.match(src,/expanded===item\.id&&<div className="a-cal-event-body hn-cal-details">/);
 assert.match(src,/<AdminCalendarMemories token=\{token\} eventId=\{item\.id\}/);
 assert.match(src,/const AdminCalendarMemories=lazy\(\(\)=>import\('\.\/AdminCalendarMemories'\)\)/);
 // AdminChatAccess already owns the live member directory. One Calendar
 // event notification must trigger only its own events request.
 assert.doesNotMatch(src,/adminMembers\(/);
 assert.match(src,/const active=members\.filter\(p=>p\.active===1\)/);
 const controller=read('apps/pwa/src/features/admin/AdminChatAccess.tsx');
 assert.match(controller,/refreshMembers\(session\.token\)/);
});
test('Calendar reports HTTP 401 as an explicitly typed session error',async()=>{
 const api={};
 runInNewContext(compiled.outputText,{
  exports:api,URL,Date,Intl,Error,Number,String,RegExp,
  fetch:async()=>({ok:false,status:401,json:async()=>({error:'Sesión vencida'})}),
  require(id){assert.equal(id,'./api-base');return {HAVANA_V2_DEV_API_BASE_URL:'https://example.test'};}
 });
 await assert.rejects(api.getCalendarEvents('token','https://example.test',true),error=>
  error instanceof api.CalendarHttpError&&error.status===401&&error.message==='Sesión vencida');
 const admin=read('apps/pwa/src/features/calendar/AdminCalendar.tsx');
 assert.match(admin,/e instanceof CalendarHttpError&&e.status===401/);
 assert.match(admin,/getCalendarEvents\(token,HAVANA_V2_DEV_API_BASE_URL,true,controller.signal\)/);
 assert.match(admin,/pending.current\?\.abort\(\)/);
});
test('Calendar uses one private push protocol in native Android and PWA, without legacy timers',()=>{
 const member=read('apps/pwa/src/features/calendar/CalendarAccordion.tsx');
 const admin=read('apps/pwa/src/features/calendar/AdminCalendar.tsx');
 const native=read('apps/android/features/calendar/NativeCalendar.tsx');
 const realtime=read('apps/pwa/src/services/calendar-live.ts');
 const pwaShell=read('apps/pwa/src/features/chat/PwaChatSurface.tsx');
 const pwaSignals=read('apps/pwa/src/features/calendar/useMemberCalendarSignals.ts');
 const nativeShell=read('apps/android/features/chat/NativeChatSurface.tsx');
 const nativeSignals=read('apps/android/features/calendar/useNativeCalendarSignals.ts');
 assert.match(pwaSignals,/watchCalendar\(token,false,reason/);
 assert.match(nativeSignals,/watchNativeCalendar\(token,reason/);
 assert.match(pwaShell,/useMemberCalendarSignals\(session\?\.token\)/);
 assert.match(nativeShell,/useNativeCalendarSignals\(session\?\.token\)/);
 assert.match(member,/calendarRevision/);
 assert.doesNotMatch(member,/watchCalendar\(/);
 assert.doesNotMatch(native,/watchNativeCalendar\(/);
 assert.match(admin,/watchCalendar\(token,true,update\)/);
 assert.doesNotMatch(member,/setInterval\(/);
 assert.doesNotMatch(admin,/setInterval\(/);
 assert.match(realtime,/window\.setInterval\(/);
 assert.match(realtime,/60000\)/);
 assert.match(realtime,/window\.clearInterval\(fallback\)/);
 assert.match(member,/pending\.current\?\.abort\(\)/);
 assert.match(member,/getCalendarEvents\(token,HAVANA_V2_DEV_API_BASE_URL,false,controller\.signal\)/);
 assert.match(shared,/signal\?:AbortSignal/);
 assert.match(realtime,/calendar\.invalidate/);
 assert.match(realtime,/onInvalidate\(\); \/\/ recover changes made before subscribing/);
 assert.doesNotMatch(realtime,/calendar\.ready/);
 assert.match(realtime,/new WebSocket\(address/);
 assert.match(realtime,/visibilitychange/);
 assert.match(realtime,/window\.addEventListener\('focus',foreground\)/);
 assert.match(realtime,/window\.addEventListener\('pageshow',pageShow\)/);
 assert.match(realtime,/if\(event\.persisted\)resume\(\)/);
 assert.match(realtime,/window\.removeEventListener\('focus',foreground\)/);
 assert.match(realtime,/window\.removeEventListener\('pageshow',pageShow\)/);
 assert.match(admin,/const requestId=useRef\(0\)/);
 assert.match(admin,/const request=\+\+requestId\.current/);
 assert.match(admin,/if\(request!==requestId\.current\|\|controller\.signal\.aborted\)return/);
 assert.match(admin,/requestId\.current\+\+/);
 assert.match(realtime,/session\./);
 assert.match(realtime,/admin\./);
 assert.doesNotMatch(realtime,/localStorage|IndexedDB|CHAT_ROOMS/);
 // Native code is staged for one explicitly approved cumulative APK; installed 0.0.13 is unchanged.
 const nativeTransport=read('apps/android/services/native-calendar-live.ts');
 assert.match(nativeTransport,/onInvalidate\('changed'\)/);
 assert.match(native,/calendarRevision/);
 assert.match(nativeTransport,/new WebSocket\(url,\['havana-v2-calendar','session\.'\+token\]\)/);
 assert.match(nativeTransport,/calendar\.invalidate/);
 assert.match(nativeTransport,/watchdog=setTimeout\(/);
 assert.match(nativeTransport,/socket.readyState!==WebSocket.OPEN/);
 assert.match(native,/<NativeBook embedded token=\{token\}/);
 assert.match(native,/open===item.id&&\(past\?/);
 assert.doesNotMatch(native,/setArchive\(|Abrir recuerdo con efecto BOOK/);
 assert.doesNotMatch(native,/setInterval\(/);
 assert.doesNotMatch(nativeTransport,/setInterval\(/);
});

test('Spanish month names sort chronologically regardless of when Admin added the event',()=>{
 const fixtures=[
  {id:'later',date:'24 de octubre 2026',dateSort:null},
  {id:'unknown',date:'Por confirmar',dateSort:null},
  {id:'earlier',date:'9 de Oct 2026',dateSort:null},
  {id:'september',date:'21/09/2026',dateSort:null},
  {id:'oct-last',date:'31 oct. 2026',dateSort:null},
  {id:'nov',date:'6-11-2026',dateSort:null}
 ];
 assert.equal(sortCalendarEvents(fixtures).map(e=>e.id).join(','),
  'september,earlier,later,oct-last,nov,unknown');
 for(const [date,expected] of [
  ['9 de Oct 2026','2026-10-09'],['24 d octubre 2026','2026-10-24'],
  ['17 octubre 2026','2026-10-17'],['14dic26','2026-12-14'],
  ['14/11/2026','2026-11-14'],['2026-11-06','2026-11-06']]){
  assert.equal(calendarSortDate(date),expected);
 }
 for(const text of ['31 febrero 2026','Por confirmar','Oct 2026','25 25 2026'])
  assert.equal(calendarSortDate(text),null);
 const past={date:'17 octubre 2026',dateSort:null,timeZone:'America/Mexico_City',status:'confirmed'};
 assert.equal(exported.calendarEventCompleted(past,new Date('2026-11-22T12:00:00Z')),true);
 assert.equal(exported.calendarEventCompleted({...past,date:'24 nov 2026'},new Date('2026-11-22T12:00:00Z')),false);
 assert.equal(exported.calendarEventCompleted({...past,status:'cancelled'},new Date('2026-11-22T12:00:00Z')),false);
});

test('Member Calendar shows one title and background calendar change alert across all screens',()=>{
 const visual=read('apps/pwa/src/app/VisualApp.tsx');
 const pwa=read('apps/pwa/src/features/calendar/CalendarAccordion.tsx');
 const nativeHome=read('apps/android/app/NativeMemberHome.tsx');
 const native=read('apps/android/features/calendar/NativeCalendar.tsx');
 const pwaShell=read('apps/pwa/src/features/chat/PwaChatSurface.tsx');
 const nativeToast=read('apps/android/features/calendar/NativeCalendarToast.tsx');
 assert.match(visual,/screen==='calendar'\?<div className="visual-section-header visual-calendar-heading">/);
 assert.match(visual,/<h1>Calendario<\/h1>/);
 assert.doesNotMatch(pwa,/Eventos · Fechas de trabajo/);
 assert.doesNotMatch(native,/EVENTOS · FECHAS DE TRABAJO/);
 assert.match(nativeHome,/active==='calendar'\?'Calendario'/);
 assert.match(pwaShell,/HAVANANICE-CALENDARIO📆/);
 assert.match(nativeToast,/HAVANANICE-CALENDARIO📆/);
 assert.match(read('packages/shared/src/member-notifications.ts'),/case 'calendar.event':return 'HAVANANICE-CALENDARIO📆'/);
 assert.match(native,/setTimeout\(tick,60000\)/);
 assert.match(pwa,/setTimeout\(tick,60000\)/);
});

const nativeListsSource=read('apps/android/features/shared/native-module-list.ts');
const nativeListsCompiled=ts.transpileModule(nativeListsSource,{compilerOptions:{
 module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const nativeListsExports={};
runInNewContext(nativeListsCompiled,{exports:nativeListsExports,AbortController,Date,Error});
const {NativeModuleList,createNativeModuleLists}=nativeListsExports;
test('native list survives screen unmount, reopens immediately, and fetches once within TTL',async()=>{
 let now=100,calls=0;
 const list=new NativeModuleList('error',45_000,()=>now);
 const load=async()=>{calls++;return ['one'];};
 const stop=list.subscribe(()=>{});
 await list.load(load);stop();
 assert.equal(list.getSnapshot().data[0],'one');
 assert.equal(list.getSnapshot().loading,false);
 await list.load(load);assert.equal(calls,1);
 now+=45_001;await list.load(load);assert.equal(calls,2);
});
test('concurrent native module loads share exactly one in-flight promise',async()=>{
 let resolve,calls=0;
 const list=new NativeModuleList('error');
 const loader=()=>{calls++;return new Promise(r=>{resolve=r;});};
 const first=list.load(loader),second=list.load(loader);
 assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 resolve(['song']);await first;
 assert.equal(list.getSnapshot().data[0],'song');
});
test('realtime invalidation removes previous data, cancels calendar and rejects late commits',async()=>{
 let resolve,signal;
 const list=new NativeModuleList('error');
 const old=list.load(s=>{signal=s;return new Promise(r=>{resolve=r;});});
 await Promise.resolve();list.invalidate();
 assert.equal(signal.aborted,true);assert.equal(list.getSnapshot().data,null);
 await list.load(async()=>['new']);
 resolve(['old']);await old;
 assert.equal(list.getSnapshot().data[0],'new');
 list.invalidate();assert.equal(list.getSnapshot().data,null);
});
test('native session lists isolate identities and never retain failed private data',async()=>{
 const a=createNativeModuleLists(),b=createNativeModuleLists();
 await a.calendar.load(async()=>['private A']);
 assert.equal(b.calendar.getSnapshot().data,null);
 a.invalidate();assert.equal(a.calendar.getSnapshot().data,null);
 await a.calendar.load(async()=>{throw Error('401');});
 assert.equal(a.calendar.getSnapshot().data,null);
 assert.equal(a.calendar.getSnapshot().loading,false);
 assert.equal(a.calendar.getSnapshot().error,'401');
});
test('native shell owns both session lists without mounting inactive screens',()=>{
 const signal=read('apps/android/features/calendar/useNativeCalendarSignals.ts');
 const home=read('apps/android/app/NativeMemberHome.tsx');
 const shell=read('apps/android/features/chat/NativeChatSurface.tsx');
 assert.match(signal,/useMemo\(\(\)=>createNativeModuleLists<CalendarEvent\[\],RepertoireSong\[\]>\(\),\[token\]\)/);
 assert.match(signal,/lists\.invalidate\(\)/);
 assert.match(shell,/lists=\{calendarSignals\.lists\}/);
 assert.match(home,/active==='calendar'\?<NativeCalendar[^>]*list=\{lists\.calendar\}/);
 assert.match(home,/active==='repertoire'\?<NativeRepertoire[^>]*list=\{lists\.repertoire\}/);
});

test('Family reuses one list per album and isolates it from other albums and shells',async()=>{
 const {createNativeFamilyLists}=nativeListsExports;
 const a=createNativeFamilyLists(),b=createNativeFamilyLists();
 let calls=0;const first=a.album('a');
 await first.load(async()=>{calls++;return ['photo'];});
 await a.album('a').load(async()=>{calls++;return ['duplicate'];});
 assert.equal(first,a.album('a'));assert.equal(calls,1);
 assert.equal(a.album('b').getSnapshot().data,null);
 assert.equal(b.album('a').getSnapshot().data,null);
 a.invalidate();assert.equal(first.getSnapshot().data,null);
});
test('Family invalidation cancels all pending metadata results, including a non-abortable old album request',async()=>{
 const {createNativeFamilyLists}=nativeListsExports;
 const cache=createNativeFamilyLists();
 await cache.directory.load(async()=>['cover']);
 let resolve;
 const album=cache.album('a');
 const old=album.load(()=>new Promise(r=>{resolve=r;}));
 await Promise.resolve();cache.invalidate();
 assert.equal(cache.directory.getSnapshot().data,null);
 await album.load(async()=>['new']);
 resolve(['deleted']);await old;
 assert.equal(album.getSnapshot().data[0],'new');
});
