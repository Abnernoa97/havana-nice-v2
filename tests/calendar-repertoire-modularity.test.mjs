import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('event setlist is its own Calendar presentation, preserving access and layout',()=>{
 const calendar=read('apps/pwa/src/features/calendar/CalendarAccordion.tsx');
 const setlist=read('apps/pwa/src/features/calendar/EventRepertoire.tsx');
 const css=read('apps/pwa/src/features/calendar/event-repertoire.css');
 assert.match(calendar,/import EventRepertoire from '\.\/EventRepertoire'/);
 assert.match(calendar,/open===item\.id&&<EventRepertoire token=\{token\} eventId=\{item\.id\} revision=\{revision\}\/>/);
 assert.doesNotMatch(calendar,/getEventRepertoire|safeRepertoireLink|import '\.\/event-repertoire\.css'/);
 assert.match(setlist,/import '\.\/event-repertoire\.css'/);
 assert.match(setlist,/getEventRepertoire\(token,eventId\)/);
 assert.match(setlist,/return\(\)=>\{alive=false;\}/);
 assert.match(setlist,/\},\[token,eventId,revision\]\)/);
 assert.match(setlist,/items\.map\(\(item,i\)=>/);
 assert.match(setlist,/safeRepertoireLink\(item\.referenceUrl\)/);
 assert.match(css,/\.hn-cal-event-repertoire\{/);
 assert.match(css,/\.hn-cal-rep-note\{/);
 assert.doesNotMatch(setlist,/new WebSocket|watchCalendar|watchRepertoire|startNamedChatSession|restoreNamedChatSession|localStorage|adminCreateSong|adminDeleteSong/);
});
test('Admin Repertoire invalidates older requests exactly once when unsubscribing',()=>{
 const src=read('apps/pwa/src/features/repertoire/AdminRepertoire.tsx');
 assert.match(src,/return\(\)=>\{catalogRequest\.current\+\+;itemsRequest\.current\+\+;stop\(\);\}/);
 assert.match(src,/useEffect\(\(\)=>\{void refreshItems\(eventId\);setChecked\(\[\]\);\},\[eventId,refreshItems\]\)/);
 assert.doesNotMatch(src,/useEffect\(\(\)=>\(\)=>\{itemsRequest\.current\+=1;\},\[\]\)/);
 assert.match(src,/request===itemsRequest\.current&&eventIdRef\.current===id/);
 assert.match(src,/watchRepertoire\(token,true/);
});
