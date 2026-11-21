import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('The administrator uses the musician HOME editorial system, not a separate visual product',()=>{
 const admin=read('apps/pwa/src/app/AdminApp.tsx');
 const entry=read('apps/pwa/src/app/admin-main.tsx');
 const shared=read('apps/pwa/src/styles/home/home.css');
 const ui=read('apps/pwa/src/styles/admin/admin-editorial.css');
 assert.match(admin,/className="a-shell visual-shell hn-admin-editorial hn-admin-minimal"/);
 assert.match(admin,/className="a-header visual-header hn-admin-minimal-header"/);
 assert.match(admin,/className="a-layout visual-layout"/);
 assert.match(admin,/className="a-main visual-content"/);
 assert.match(admin,/className="a-bottom visual-bottom-nav"/);
 assert.match(entry,/import '\.\.\/styles\/home\/home.css'/);
 assert.match(entry,/import '\.\.\/styles\/admin\/admin-editorial.css'/);
 assert.match(shared,/\.visual-bottom-nav/);
 assert.match(ui,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(admin,/Tu espacio de trabajo|visual-welcome|Servidor conectado/);
});

test('The six navigation destinations are real; Admin retains the only secure management channel',()=>{
 const admin=read('apps/pwa/src/app/AdminApp.tsx');
 const access=read('apps/pwa/src/features/admin/AdminChatAccess.tsx');
 const server=read('cloudflare/src/modules/admin/admin-auth.js');
 assert.match(admin,/type WorkTab=Exclude<Tab,'home'>/);
 assert.match(admin,/AdminChatAccess section=\{tab==='home'\?'access':tab\}/);
 assert.match(admin,/id:'memory'/);
 assert.match(admin,/id:'access'/);
 assert.match(access,/adminLogin\(password\)/);
 assert.match(access,/if\(!session\)return/);
 assert.match(server,/verifyAdminSession/);
 assert.doesNotMatch(admin,/startNamedChatSession|restoreNamedChatSession|localStorage|sessionStorage|new WebSocket|new D1Database/);
});

test('Admin Chat reuses current private media and deletion controls, without impersonating a musician',()=>{
 const chat=read('apps/pwa/src/features/chat/AdminChatGeneral.tsx');
 const ui=read('apps/pwa/src/styles/admin/admin-editorial.css');
 assert.match(chat,/ChatMediaView/);
 assert.match(chat,/adminChatMessages\(token/);
 assert.match(chat,/adminDeleteChatMessage\(token,message.seq\)/);
 assert.match(chat,/className="a-chat-delete"/);
 assert.match(ui,/\.a-chat-bubble/);
 assert.doesNotMatch(chat,/startNamedChatSession|sendChatMessage|localStorage|new WebSocket/);
});

test('Calendar, songs, and albums reuse musician presentation while retaining admin actions',()=>{
 const calendar=read('apps/pwa/src/features/calendar/AdminCalendar.tsx');
 const repertoire=read('apps/pwa/src/features/repertoire/AdminRepertoire.tsx');
 const family=read('apps/pwa/src/features/family/AdminFamily.tsx');
 const master=read('apps/pwa/src/features/repertoire/MemberRepertoire.tsx');
 assert.match(calendar,/a-cal-event hn-cal-event/);
 assert.match(calendar,/a-cal-summary hn-cal-event-head/);
 assert.match(calendar,/adminDeleteCalendarEvent/);
 assert.match(calendar,/adminCreateCalendarEvent/);
 assert.match(repertoire,/hn-rep-row hn-admin-rep-row/);
 assert.match(repertoire,/adminCreateSong/);
 assert.match(repertoire,/adminDeleteSong/);
 assert.match(repertoire,/adminCompleteEventItem/);
 assert.match(repertoire,/adminReorderEventItems/);
 assert.match(master,/className="hn-rep-row"/);
 assert.match(family,/hn-family-album-art/);
 assert.match(family,/familyPrivateMediaUrl\(item.coverUrl\)/);
 assert.match(family,/FamilyMediaGallery items=\{readyItems\} onDelete=/);
 assert.doesNotMatch(calendar+repertoire+family,/startNamedChatSession|restoreNamedChatSession|new D1Database/);
});
