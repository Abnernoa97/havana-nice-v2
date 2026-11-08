import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const ui=read('../src/app/AdminApp.tsx');
const directory=read('../src/features/admin/AdminMemberDirectory.tsx');
const panel=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
const api=read('../src/services/admin-api.ts');
const backend=read('../../../cloudflare/src/index.ts');

test('Admin musician roster ignores stale fetches after deletes, additions, or logout',()=>{
 const access=read('../src/features/admin/AdminChatAccess.tsx');
 assert.match(access,/const rosterRequest=useRef\(0\)/);
 assert.match(access,/const request=\+\+rosterRequest\.current/);
 assert.match(access,/if\(request!==rosterRequest\.current\)return/);
 assert.match(access,/const result=await adminRemoveMember\(session\.token,person\.actor_id,person\.display_name\);[\s\S]*?rosterRequest\.current\+\+;[\s\S]*?setMembers\(previous=>previous\.filter/);
 assert.match(access,/const result=await adminCreateMember\(session\.token,name\.trim\(\)\);\s*rosterRequest\.current\+\+;/);
 assert.match(access,/const token=session\.token;\s*rosterRequest\.current\+\+;/);
 assert.doesNotMatch(access,/setInterval\(/);
});
test('single installable Administrator PWA, separate from Chat',()=>{
 assert.match(read('../admin.html'),/id="admin-root"/);
 assert.match(read('../vite.config.ts'),/admin\.html/);
 assert.doesNotMatch(read('../src/app/admin-main.tsx'),/from '\.\/App'/);
 const manifest=JSON.parse(read('../public/admin.webmanifest'));
 assert.equal(manifest.start_url,'/admin.html');
 assert.equal(manifest.id,'/havana-nice-v2-administrador');
 assert.equal(manifest.display,'standalone');
});
test('PWA admin network-only HTML and safe automatic refresh',()=>{
 const sw=read('../public/sw.js');
 const main=read('../src/app/admin-main.tsx');
 assert.match(sw,/navigation && path === '\/admin\.html'\) return/);
 assert.match(main,/fetch\('\/admin\.html',\{cache:'no-store'\}\)/);
 assert.match(main,/serviceWorker\.register\('\/sw\.js'/);
});
test('five Administrator modules, only Acceso a músicos is active',()=>{
 for(const section of ['Acceso a músicos','Chat','Repertorio','Calendario','Más'])assert.ok(ui.includes(section));
 assert.match(ui,/useState<Tab>\('access'\)/);
 assert.match(ui,/fetchBackendHealth/);
 assert.match(panel,/section!=='access'/);
 assert.match(ui,/Por ahora no hay funciones activas/);
 assert.doesNotMatch(ui,/setTab\('requests'\)|setTab\('devices'\)/);
});
test('Admin member directory is presentation-only and preserves every action in one controller',()=>{
 const source=read('../src/features/admin/AdminChatAccess.tsx');
 assert.match(source,/import AdminMemberDirectory from '\.\/AdminMemberDirectory'/);
 assert.match(source,/<AdminMemberDirectory[\s\S]*onToggleMember=\{toggleMember\}[\s\S]*onRemoveMember=\{removeMember\}[\s\S]*onReleaseInstallation=\{releaseInstallation\}[\s\S]*onInspectMemberData=\{inspectMemberData\}/);
 for(const label of ['Músicos autorizados','Historial de accesos','Liberar dispositivo','Ver datos asociados','Eliminar definitivamente a']){
  assert.ok(directory.includes(label),'Lost roster presentation: '+label);
 }
 assert.doesNotMatch(directory,/new WebSocket|openAdminRealtime\(|adminRemoveMember\(|adminReleaseInstallation\(|adminMemberHistory\(|fetch\(/);
 assert.doesNotMatch(source,/function MemberImpactSummary\(|className="a-member-rows"/);
});

test('authenticated Administrator creates members from a real form, not mock data',()=>{
 assert.match(panel,/Añadir miembro/);
 assert.match(panel,/Añadir y autorizar/);
 assert.match(panel,/adminCreateMember\(session\.token,name\.trim\(\)\)/);
 assert.match(panel,/adminMembers\(token\)/);
 assert.match(panel,/Músicos autorizados/);
 assert.match(panel,/await refreshMembers\(session\.token\)/);
 assert.doesNotMatch(ui,/const fakeMembers|demoRequests|mockSessions/);
});
test('new musician endpoint requires a separate verified Administrator token',()=>{
 assert.match(backend,/url\.pathname === '\/api\/chat\/admin\/members'/);
 assert.match(backend,/if \(!await verifyAdminSession\(request,env\)\)/);
 assert.match(backend,/request\.method === 'POST'/);
 assert.match(backend,/INSERT OR IGNORE INTO chat_members\(username,actor_id,display_name,active\)/);
 assert.match(backend,/created\.meta\?\.changes/);
 assert.match(backend,/Este nombre ya existe en el Administrador/);
 assert.match(backend,/notifyAdminClients\(env,'members'\)/);
 assert.match(api,/adminCreateMember\(token:string,displayName:string\)/);
 assert.match(api,/authenticated\(token,\{method:'POST'/);
});
test('admin cannot leak credential or store privileged session in browser',()=>{
 for(const c of [ui,panel,api,read('../admin.html')]){
  assert.doesNotMatch(c,/localStorage\.|sessionStorage\.|indexedDB\.|V2_ADMIN_LOGIN_SECRET|V2_DEVICE_ADMIN_SECRET/);
 }
 assert.match(panel,/adminLogin\(password\)/);
 assert.match(panel,/adminLogout\(token\)/);
 assert.match(panel,/adminVerify\(session\.token\)/);
 assert.match(api,/cache:'no-store'/);
});
test('Admin recovers a stalled private WebSocket without a duplicate session or socket',()=>{
 const source=read('../src/features/admin/AdminChatAccess.tsx');
 assert.match(source,/watchdog=setTimeout\(/);
 assert.match(source,/opened.readyState===WebSocket.OPEN/);
 assert.match(source,/\},9000\)/);
 assert.match(source,/opened.onopen=\(\)=>\{if\(active&&socket===opened\)clearWatchdog\(\)/);
 assert.match(source,/opened.onclose=e=>\{/);
 assert.match(source,/clearWatchdog\(\);socket=null/);
 assert.match(source,/active=false;clearTimeout\(expiryTimer\);clearWatchdog\(\)/);
 assert.match(source,/adminVerify\(session.token\)/);
 assert.doesNotMatch(source,/setInterval\(/);
});
test('real-time admin list invalidates on membership changes',()=>{
 assert.match(api,/new WebSocket\(url,\['havana-v2-admin','admin\.'\+token\]\)/);
 assert.match(panel,/openAdminRealtime\(session\.token/);
 assert.match(panel,/event\.topic==='members'/);
 assert.match(panel,/document\.addEventListener\('visibilitychange',resume\)/);
});
test('musician PWA uses server allowlist instead of device experiments',()=>{
 const pwa=read('../src/app/App.tsx'),android=read('../../android/App.tsx');
 assert.match(pwa,/startNamedChatSession\(name\.trim\(\)\)/);
 assert.match(pwa,/Introduce el nombre que el Administrador creó y autorizó/);
 assert.match(android,/startNamedChatSession\(name\.trim\(\)\)/);
 assert.match(backend,/FROM chat_members WHERE username=\? AND active=1/);
 assert.match(backend,/normalizeMusicianName\(payload\?\.displayName\)/);
 assert.match(backend,/replace\(\/\\s\+\/g, ' '\)/);
});
test('original musician offline storage and Chat remain intact',()=>{
 const pwa=read('../src/app/App.tsx'),android=read('../../android/App.tsx');
 assert.match(pwa,/loadLocalChat\(\)/);
 assert.match(read('../src/services/local.ts'),/offline-outbox-v1/);
 assert.match(read('../../android/services/chatStorage.ts'),/havana-v2-chat-local-v1/);
 assert.match(android,/loadNativeLocalChat\(\)/);
 assert.doesNotMatch(pwa,/Enrollment|device_approval_required|checkEnrollment/);
 assert.doesNotMatch(android,/Enrollment|device_approval_required|checkEnrollment/);
});

test('Administrator can explicitly close other sessions but cannot clear the current one',()=>{
 const ui=read('../src/features/admin/AdminChatAccess.tsx');
 const api=read('../src/services/admin-api.ts');
 assert.match(ui,/adminOtherSessions\(token\)/);
 assert.match(ui,/refreshOtherSessions\(session\.token\)/);
 assert.match(ui,/adminRevokeOtherSessions\(session\.token\)/);
 assert.match(ui,/window\.confirm\(/);
 assert.match(ui,/Cerrar otras sesiones/);
 assert.match(api,/\/api\/chat\/admin\/auth\/sessions/);
 assert.match(api,/\/api\/chat\/admin\/auth\/revoke-others/);
 assert.doesNotMatch(api,/adminDeviceRequests\(|adminDeviceAction\(/);
});
test('Administrator frontend defers new versions while its session or unsaved form is active',()=>{
 const main=read('../src/app/admin-main.tsx');
 const admin=read('../src/app/AdminApp.tsx');
 const access=read('../src/features/admin/AdminChatAccess.tsx');
 assert.match(main,/adminSessionActive==='true'/);
 assert.match(main,/formHasDraft/);
 assert.match(main,/adminUpdatePending='true'/);
 assert.match(admin,/havana-admin-update-pending/);
 assert.match(admin,/Se aplicará cuando cierres sesión/);
 assert.match(access,/dataset\.adminSessionActive=session\?'true':'false'/);
});

test('Admin retains an authorized session during network outages and retries on resume',()=>{
 const access=read('../src/features/admin/AdminChatAccess.tsx');
 const api=read('../src/services/admin-api.ts');
 assert.match(api,/export class AdminApiError extends Error/);
 assert.match(api,/export function isAdminUnauthorized/);
 assert.match(api,/reason instanceof AdminApiError && reason\.status===401/);
 assert.match(access,/if\(isAdminUnauthorized\(reason\)\)/);
 assert.match(access,/else setError\('Sin conexión temporal\. La sesión sigue abierta/);
 assert.match(access,/conservamos la sesión y los datos cargados/);
 assert.doesNotMatch(access,/catch\(\(\)=>setSession\(null\)\)/);
});

test('Access to musicians uses only server-confirmed list changes and fresh history',()=>{
 const access=read('../src/features/admin/AdminChatAccess.tsx');
 const deletion=access.indexOf('await adminRemoveMember(session.token,person.actor_id,person.display_name)');
 const confirmedDelete=access.indexOf('setMembers(previous=>previous.filter(item=>item.actor_id!==person.actor_id))');
 assert.ok(deletion>0&&confirmedDelete>deletion,'Do not remove a musician from UI before server confirmation');
 const creation=access.indexOf('const result=await adminCreateMember(session.token,name.trim())');
 const confirmedCreate=access.indexOf('setMembers(previous=>previous.some(item=>item.actor_id===result.member.actor_id)');
 assert.ok(creation>0&&confirmedCreate>creation,'Do not display a created musician before D1 confirmed it');
 assert.match(access,/setHistory\(previous=>\{const next=\{\.\.\.previous\};delete next\[person\.actor_id\];return next;\}\)/);
 assert.match(directory,/historyErrors\[person\.actor_id\]/);
 assert.match(access,/No se pudo consultar el historial en Cloudflare/);
 assert.match(directory,/role="alert">\{historyErrors\[person\.actor_id\]\}/);
});

test('only Administrator-created active names reach the session-minting endpoint',()=>{
 const index=read('../../../cloudflare/src/index.ts');
 const app=read('../src/app/App.tsx');
 assert.match(app,/startNamedChatSession\(name\.trim\(\)\)/);
 const login=index.indexOf("if (url.pathname === '/api/chat/session' && request.method === 'POST')");
 const lookup=index.indexOf("SELECT username,actor_id,display_name FROM chat_members WHERE username=? AND active=1",login);
 const denial=index.indexOf("if (!member) return respond({ error: 'Tu nombre todavía no está autorizado.",lookup);
 const mint=index.indexOf("const session=await createSession(env,member,request);",denial);
 assert.ok(login>=0 && lookup>login && denial>lookup && mint>denial,
   'Only an active, Administrator-allowlisted name may mint a musician session');
 assert.match(index,/if \(!username\) return respond\(\{ error: 'Escribe tu nombre para entrar' \}, 400, origin\)/);
});

test('Admin session count stays accurate on manual refresh, foreground, and WebSocket reconnection',()=>{
 const panel=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
 assert.match(panel,/const refreshOtherSessions=useCallback\(async\(token:string\)=>/);
 assert.match(panel,/void refreshMembers\(session\.token\);void refreshOtherSessions\(session\.token\);/);
 assert.match(panel,/adminVerify\(session\.token\)\.then\(\(\)=>\{void refreshMembers\(session\.token\);void refreshOtherSessions\(session\.token\);void refreshDuplicateAlerts\(session\.token\);\}\)/);
 assert.match(panel,/onClick=\{\(\)=>\{void refreshMembers\(session\.token\);void refreshOtherSessions\(session\.token\);void refreshDuplicateAlerts\(session\.token\);\}\}/);
 assert.match(panel,/if\(isAdminUnauthorized\(reason\)\)/);
 assert.match(panel,/else setOtherSessions\(null\)/);
 assert.match(panel,/window\.confirm\('¿Cerrar las otras '/);
});

test('Administrator reconnects safely after offline and background without duplicate sockets',()=>{
 const panel=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
 assert.match(panel,/const previous=socket;\s*clearWatchdog\(\);socket=null; \/\/ The next foreground\/online event may connect immediately\./);
 assert.match(panel,/if\(previous&&previous\.readyState!==WebSocket\.CLOSED\)previous\.close\(\)/);
 assert.match(panel,/if\(!active\|\|socket!==opened\)return/);
 assert.match(panel,/socket&&\(socket\.readyState===WebSocket\.OPEN\|\|socket\.readyState===WebSocket\.CONNECTING\)/);
 assert.match(panel,/socket\.readyState===WebSocket\.CLOSING\|\|socket\.readyState===WebSocket\.CLOSED/);
 assert.match(panel,/if\(!document\.hidden&&navigator\.onLine\)/);
 assert.match(panel,/if\(timer!==null\)\{clearTimeout\(timer\);timer=null;\}/);
 assert.match(panel,/document\.addEventListener\('visibilitychange',resume\)/);
 assert.match(panel,/window\.addEventListener\('online',resume\)/);
 assert.match(panel,/window\.addEventListener\('offline',resume\)/);
});

test('Admin never labels Chrome reduced historical K as a real phone model',()=>{
 const app=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
 assert.match(app,/event\.device_model==='K'&&event\.operating_system==='Android 10'/);
 assert.match(app,/Android \(versión no disponible\)/);
 assert.match(app,/event\.device_model&&event\.device_model!=='K'/);
 assert.match(app,/Modelo no disponible/);
});

test('musician removal requires authenticated D1 preview and confirmation',()=>{
 const ui=read('../src/features/admin/AdminChatAccess.tsx');
 const api=read('../src/services/admin-api.ts');
 const server=read('../../../cloudflare/src/modules/admin/member-admin.js');
 const route=read('../../../cloudflare/src/index.ts');
 const preview=ui.indexOf('await adminDeletionPreview(session.token,person.actor_id)');
 const approve=ui.indexOf('const approved=window.confirm(',preview);
 const perform=ui.indexOf('await adminRemoveMember(session.token,person.actor_id,person.display_name)',approve);
 assert.ok(preview>0&&approve>preview&&perform>approve,'Impact must be read and confirmed before deletion');
 assert.match(ui,/!preview.canDelete/);
 assert.match(ui,/Mensajes propios:/);
 assert.match(ui,/Sesiones:/);
 assert.match(api,/adminDeletionPreview\(token:string,actorId:string\)/);
 assert.match(api,/authenticated\(token\)/);
 assert.doesNotMatch(server,/chat_media_assets/);
 assert.match(server,/member-delete-preview/);
 assert.match(route,/api\/chat\/admin\/member-delete-preview/);
});

test('member data inspection can be verified without pressing irreversible trash',()=>{
 const app=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
 const api=read('../src/services/admin-api.ts');
 const inspect=app.indexOf('async function inspectMemberData(person:AdminMember)');
 const trash=app.indexOf('async function removeMember(person:AdminMember)');
 assert.ok(inspect>0&&trash>inspect,'Read-only inspection must be independent of delete');
 const body=app.slice(inspect,trash);
 assert.match(body,/await adminDeletionPreview\(session\.token,person\.actor_id\)/);
 assert.doesNotMatch(body,/adminRemoveMember\(|window\.confirm\(/,'Inspector must never mutate or confirm a delete');
 assert.match(app,/Ver datos asociados/);
 assert.match(app,/Consulta de solo lectura\. No elimina ni modifica información/);
 assert.match(app,/function MemberImpactSummary/);
 assert.match(app,/counts\.sessions/);
 assert.match(app,/counts\.historyEvents/);
 assert.match(app,/name=\{person\.display_name\} preview=\{impact\[person\.actor_id\]!\}/);
 assert.match(api,/method:'POST',body:JSON\.stringify\(\{actorId,confirmName\}\)/);
 assert.match(api,/return api<AdminDeletionPreview>/);
 assert.match(api,/authenticated\(token\)/);
});

test('read-only account audit does not carry data into logout',()=>{
 const app=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
 assert.match(app,/setExpanded\(''\);setHistory\(\{\}\);setHistoryErrors\(\{\}\);setImpact\(\{\}\);setImpactErrors\(\{\}\)/);
 assert.match(app,/delete next\[person\.actor_id\]/);
});

test('Admin deletion covers Chat R2 attachments, Familia albums and safe retry',()=>{
 const panel=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
 const api=read('../src/services/admin-api.ts');
 const backend=read('../../../cloudflare/src/modules/admin/member-admin.js');
 const route=read('../../../cloudflare/src/index.ts');
 assert.match(panel,/counts\.chatMedia/);
 assert.match(panel,/counts\.familyMedia/);
 assert.match(panel,/counts\.pendingUploads/);
 assert.match(panel,/adminRetryMemberMediaCleanup\(session\.token,cleanupRetry\.actorId\)/);
 assert.match(panel,/Reintentar limpieza R2 de/);
 assert.match(api,/member-media-cleanup/);
 assert.match(api,/cleanupPending:number\|null/);
 assert.match(route,/api\/chat\/admin\/member-media-cleanup/);
 assert.match(backend,/r2_member_delete_queue/);
 assert.match(backend,/DELETE FROM chat_media_objects WHERE sender_id/);
 assert.match(backend,/DELETE FROM family_media WHERE actor_id/);
 assert.match(backend,/cleanupMemberMedia\(env,actorId\)/);
});

test('member counters do not mistake D1 session rows for live connected phones',()=>{
 const panel=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
 assert.match(panel,/Credenciales de acceso/);
 assert.match(panel,/Las credenciales registradas no equivalen a teléfonos conectados/);
 assert.match(panel,/Las reacciones incluyen las vinculadas al músico o a sus mensajes/);
 assert.match(panel,/<dd>\{counts\.sessions\}<\/dd>/);
});

test('one-musician one-installation alerts never display bearer tokens and release is separate from trash',()=>{
 const panel=read('../src/features/admin/AdminChatAccess.tsx')+'\n'+directory;
 const api=read('../src/services/admin-api.ts');
 const worker=read('../../../cloudflare/src/index.ts');
 assert.match(panel,/Intentos de acceso duplicado/);
 assert.match(panel,/void refreshDuplicateAlerts\(session\.token\)/);
 assert.match(panel,/adminReviewDuplicateLogin\(session\.token,id\)/);
 assert.match(panel,/async function releaseInstallation\(person:AdminMember\)/);
 assert.match(panel,/adminReleaseInstallation\(session\.token,person\.actor_id,person\.display_name\)/);
 assert.match(panel,/Liberar dispositivo/);
 assert.match(panel,/No se borrarán sus mensajes/);
 assert.match(api,/adminDuplicateLogins\(token:string\)/);
 assert.match(api,/authenticated\(token\)/);
 assert.doesNotMatch(worker,/single_device_mode/);
 assert.match(worker,/code:'name_already_bound'/);
 assert.match(worker,/claimFirstInstallation/);
 assert.doesNotMatch(panel,/token_hash|installation_secret|cf-connecting-ip/i);
});

test('legacy device approval endpoints and UIs are permanently removed',()=>{
 const worker=read('../../../cloudflare/src/index.ts');
 const api=read('../../../packages/shared/src/index.ts');
 const access=read('../src/features/admin/AdminChatAccess.tsx');
 for(const code of [worker,api,access]){
  assert.doesNotMatch(code,/device_approval_required|PendingChatDeviceEnrollment|device\/request|device\/status|admin\/device-requests|chat\/pwa\/session/);
 }
 assert.match(worker,/claimFirstInstallation/);
 assert.match(worker,/name_already_bound/);
 assert.match(access,/Intentos de acceso duplicado/);
 assert.match(directory,/Liberar dispositivo/);
});

test('Administrator Chat uses the existing authenticated session, not a musician login',()=>{
 const frame=read('../src/app/AdminApp.tsx');
 const access=read('../src/features/admin/AdminChatAccess.tsx');
 const viewer=read('../src/features/chat/AdminChatGeneral.tsx');
 const api=read('../src/services/admin-api.ts');
 const worker=read('../../../cloudflare/src/index.ts');
 assert.match(access,/section==='chat'[\s\S]*<AdminChatGeneral/);
 assert.match(frame,/tab!=='access'&&tab!=='chat'/);
 assert.match(viewer,/adminChatMessages\(token/);
 assert.match(viewer,/adminDeleteChatMessage\(token,message.seq\)/);
 assert.match(viewer,/admin.chat.message/);
 assert.match(viewer,/m.senderName/);
 assert.doesNotMatch(viewer,/startNamedChatSession|chat.send|textarea|type="submit"/);
 assert.match(api,/\/api\/chat\/admin\/messages/);
 assert.match(worker,/handleAdminChat\(request,env,url,origin,respond\)/);
});

test('Admin login form accepts normal 8+ character passwords and agrees with Worker',()=>{
 const source=read('../../../cloudflare/src/modules/admin/admin-auth.js');
 assert.match(source,/const MIN_SECRET_LENGTH=8;/);
 assert.ok(panel.includes('required minLength={8} maxLength={256}/>'));
 assert.ok(!panel.includes('minLength={40}'));
 assert.ok(panel.includes('adminLogin(password)'));
});
