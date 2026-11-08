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
const {calendarDate,safeCalendarMapUrl}=exported;

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

test('Calendar uses one private push protocol in native Android and PWA, without legacy timers',()=>{
 const member=read('apps/pwa/src/features/calendar/CalendarAccordion.tsx');
 const admin=read('apps/pwa/src/features/calendar/AdminCalendar.tsx');
 const native=read('apps/android/features/calendar/NativeCalendar.tsx');
 const realtime=read('apps/pwa/src/services/calendar-live.ts');
 assert.match(member,/watchCalendar\(token,false,update\)/);
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
 assert.match(admin,/if\(request!==requestId\.current\)return/);
 assert.match(admin,/requestId\.current\+\+/);
 assert.match(realtime,/session\./);
 assert.match(realtime,/admin\./);
 assert.doesNotMatch(realtime,/localStorage|IndexedDB|CHAT_ROOMS/);
 // Native code is staged for one explicitly approved cumulative APK; installed 0.0.13 is unchanged.
 const nativeTransport=read('apps/android/services/native-calendar-live.ts');
 assert.match(native,/watchNativeCalendar\(token/);
 assert.match(nativeTransport,/new WebSocket\(url,\['havana-v2-calendar','session\.'\+token\]\)/);
 assert.match(nativeTransport,/calendar\.invalidate/);
 assert.doesNotMatch(native,/setInterval\(/);
 assert.doesNotMatch(nativeTransport,/setInterval\(/);
});
