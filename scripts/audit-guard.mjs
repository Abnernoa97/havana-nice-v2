import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
// This development branch should not grow copies of the original main app.
// Keep its root limited to the V2 workspace and CI workflow definitions.
assert.deepEqual(readdirSync(new URL('../../', import.meta.url)).filter(
  name=>!['.git','.github','v2'].includes(name)
),[],'V2 development branch must not include unused main-era root files');
const worker = read('cloudflare/src/index.ts');
assert.doesNotMatch(worker,/\/\/\s*@ts-nocheck\b/,'V2 Worker entrypoint must remain strictly typechecked');
const android = read('apps/android/App.tsx');
const pwa = read('apps/pwa/src/App.tsx');
const nativeBubble = read('apps/android/SwipeableBubble.tsx');
const webBubble = read('apps/pwa/src/SwipeMessage.tsx');
const pwaStyles = read('apps/pwa/src/styles.css');
const serviceWorker = read('apps/pwa/public/sw.js');
const workerConfig = read('cloudflare/wrangler.jsonc');
const androidWorkflow = read('../.github/workflows/v2-android-apk.yml');
const workflows=readdirSync(new URL('../../.github/workflows/',import.meta.url)).sort();
assert.deepEqual(workflows,['v2-android-apk.yml','v2-foundation-check.yml'],
  'V2 must have one release workflow and one verification workflow, no historical automation');
const reproducibleWorker=JSON.parse(workerConfig);
assert.equal(reproducibleWorker.vars?.V2_ADMIN_LOGIN_MODE,'enabled',
  'Admin login mode must be declared in source, never set only by hand on deployed Worker');
assert.equal(reproducibleWorker.vars?.V2_ADMIN_LOGIN_SECRET,undefined,
  'Admin login secret must never enter source-controlled Wrangler configuration');
assert.equal(reproducibleWorker.services,undefined,
  'No separate service bridge may be reintroduced');

const readme = read('README.md');

function absent(content,pattern,label) {
  assert.equal(pattern.test(content),false,label);
}
function present(content,pattern,label) {
  assert.ok(pattern.test(content),label);
}

// Automatic preflight checks that guard the V2 architecture against regressions.
for(const [value,label] of [[worker,'Worker'],[android,'Android'],[pwa,'PWA']]) {
  absent(value,/LAB_CODE_SHA256|startLabChatSession|Clave de laboratorio|accessCode/,
    label+' must not revive the old laboratory password');
}
present(worker,/JOIN chat_members/,'Worker must validate the enabled member on session reuse');
present(worker,/active=1/,'Worker must deny revoked names');
present(worker,/chat\.revoked/,'Worker must notify active sessions when access is revoked');
// Exactly one cross-origin policy for PWA and administrator.
// A DELETE preflight is required by Chrome/Safari before the moderator can remove a message.
present(worker,/'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS'/,
 'Chat Admin delete-for-all must remain permitted in the central CORS preflight');
assert.equal((worker.match(/'access-control-allow-methods':/g)||[]).length,1,
 'Single Worker must own one CORS allow-methods declaration');
// One name, one installation: the discarded approvals implementation must not
// survive in source, migrations, UI, or routes.
const adminAuth=read('cloudflare/src/admin-auth.js');
const adminMigration=read('cloudflare/migrations/0010_chat_admin_sessions.sql');
const musicianMigration=read('cloudflare/migrations/0007_named_musician_access.sql');
absent(musicianMigration,/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+chat_members\b/i,
  'No musician accounts may be auto-seeded by historical migrations');
present(adminAuth,/V2_ADMIN_LOGIN_MODE==='enabled'/,'Admin login must remain explicit');
present(adminAuth,/chat_admin_login_limits/,'Admin login must rate limit failed attempts');
present(adminAuth,/revoked_at/,'Admin session must support revocation');
present(adminMigration,/CREATE TABLE IF NOT EXISTS chat_admin_sessions/,'Admin sessions need isolated D1 storage');
present(adminAuth,/MIN_SECRET_LENGTH=8/,'Administrator password must have a documented minimum without disabling user-chosen passwords');
present(adminAuth,/ATTEMPT_WINDOW=15\*60\*1000/,'Admin login must preserve the rate-limit window');
present(adminAuth,/Number\(existing\.failures\)>=5/,'Admin login must keep failed-attempt lockout');
const installation=read('cloudflare/src/single-installation.js');
present(worker,/claimFirstInstallation/,'One name must bind only to one installation');
present(worker,/name_already_bound/,'Duplicate logins must be denied');
present(installation,/chat_duplicate_login_alerts/,'Attempt alerts must be persisted');
present(installation,/release-installation/,'Admin must be able to release without deletion');
for(const [value,label] of [[worker,'Worker'],[android,'Android'],[pwa,'PWA'],
 [read('packages/shared/src/index.ts'),'Shared client']]){
 absent(value,/device_approval_required|PendingChatDeviceEnrollment|checkChatDeviceEnrollment|requestChatDeviceEnrollment|chat\/pwa\/session|device\/request|device\/status|admin\/device-requests/,
  label+' must not revive the discarded device approval workflow');
}

// Access-surface invariant: one Admin-controlled name creation route and one
// musician enrollment route. GET restoration never mints a second identity.
// The Administrator has its own session endpoint, not another musician login.
const musicianRouteMethods=[...worker.matchAll(/url\.pathname === '\/api\/chat\/session' && request\.method === '(POST|GET|DELETE)'/g)]
  .map(match=>match[1]).sort();
assert.deepEqual(musicianRouteMethods,['GET','POST'],
  'Musician Chat must expose only enrollment POST and restoration GET');
assert.equal((worker.match(/INSERT OR IGNORE INTO chat_members\(username,actor_id,display_name,active\)/g)||[]).length,1,
  'Only one Administrator-created musician account INSERT is allowed');
present(worker,/if \(!await verifyAdminSession\(request,env\)\)/,
  'Only authenticated Administrator may create a musician');
present(worker,/if \(!member\) return respond\(\{ error: 'Tu nombre todavía no está autorizado/,
  'Unknown names must not be enrolled automatically');
present(worker,/const claimed=await claimFirstInstallation/,
  'Every musician must pass the single-installation guard');
absent(worker,/single_device_mode|closeUnboundChatSession/,
  'No legacy multi-device bypasses permitted');
present(worker,/INSERT OR IGNORE INTO chat_members\(username,actor_id,display_name,active\) VALUES\(\?,\?,\?,1\)/,
  'New musician records must use one Administrator-only enrollment path; every login claims its sole owner');
absent(read('cloudflare/src/single-installation.js'),/single_device_mode/,
  'The owner record must be the only musician installation policy');
absent(read('apps/pwa/src/AdminChatAccess.tsx'),/single_device_mode|Acceso anterior protegido/,
  'Administrator cannot show or enforce historical alternative access');
absent(read('apps/pwa/src/admin-api.ts'),/single_device_mode/,
  'Administrator API must not expose a discarded mode flag');
present(read('cloudflare/migrations/0017_remove_legacy_member_mode.sql'),
  /ALTER TABLE chat_members DROP COLUMN single_device_mode;/,
  'Old schema field must be physically removed by a forward migration');
present(android,/restoreNamedChatSession/,'Android must restore only authorized remembered sessions');
present(pwa,/restoreNamedChatSession/,'PWA must restore only authorized remembered sessions');

absent(serviceWorker,/cache\.put\(event\.request,\s*copy\)/,
  'Never store arbitrary network replies in browser caches');
present(serviceWorker,/req\.headers\.has\('authorization'\)/,
  'Reject API requests with Authorization headers in PWA service worker');
present(serviceWorker,/url\.origin !== self\.location\.origin/,
  'Reject cross-origin requests in service worker');
present(serviceWorker,/path\.startsWith\('\/assets\/'\)/,
  'Only approved static app resources are cached');

absent(workerConfig,/"services"\s*:/i,'No legacy service bindings permitted');
absent(workerConfig,/"V2_MEDIA_UPLOADS"\s*:\s*"enabled"/,
  'Do not enable unapproved media uploads');
present(readme,/R2 privado de V2 \*\*activado el 01\/11\/2026\*\*/i,'README must match verified private R2 activation');
assert.deepEqual(reproducibleWorker.r2_buckets,[{binding:'MEDIA_BUCKET',bucket_name:'havana-nice-v2-media'}],
  'The one canonical V2 Worker must use one private media bucket only');
present(androidWorkflow,/retention-days:\s*1\b/,'Keep Android build artifacts for one day');
absent(androidWorkflow,/retention-days:\s*30\b/,'No 30-day APK artifacts');
absent(androidWorkflow,/gh run list|RUN_ID=/,'Single Android release must not poll another workflow');
present(androidWorkflow,/DEST_BRANCH=havana-nice-v2-apk-downloads/,'Single release flow must publish only to V2 binaries');
present(androidWorkflow,/HAVANA-NICE-V2-LATEST\.apk/,'One stable APK download filename');
const androidConfig=JSON.parse(read('apps/android/app.json'));
assert.equal(androidConfig.expo.android.package,'com.havananice.v2',
  'H01: never change Android package ID');
assert.ok(Number.isInteger(androidConfig.expo.android.versionCode) && androidConfig.expo.android.versionCode >= 2,
  'H01: release APK needs explicit Android versionCode');
present(androidWorkflow,/EXPECTED_CODE/,'H01: verify actual APK versionCode matches app config');
const apkSignerGate=read('scripts/apk-signature-gate.py');
present(androidWorkflow,/python3 v2\/scripts\/apk-signature-gate\.py/,
  'H01: compare verified v2 signing certificates directly');
present(apkSignerGate,/previous != current/,
  'H01: block release when public X.509 signing hashes differ');
present(apkSignerGate,/APK Signature Scheme v2 not found/,
  'H01: refuse missing Android signing scheme');
assert.ok(androidWorkflow.includes('test "$current_code" -gt "$previous_code"'),
  'H01: block non-monotonic Android versionCode');
present(androidWorkflow,/sha256sum -c -/,'H01: verify hash of preceding released APK');

// C01: both interfaces anchor the long-press menu to a real bubble; do not
// allow the old centered overlay or inert '+' to regress on Android/iPhone.
present(nativeBubble,/measureInWindow\(/,'Native Chat must measure held bubble');
present(android,/onLongPress=\{\(anchor\) => showMessageMenu\(message,anchor\)\}/,
  'Native Chat must show the contextual menu for the measured message');
present(android,/menuTop/,'Native contextual menu must calculate a bounded top coordinate');
// Android 16 / Expo edge-to-edge: the composer must move above the IME.
// A layout that relies only on adjustResize left the input behind the keyboard.
present(android,/behavior=\{Platform\.OS === 'ios' \? 'padding' : 'height'\}/,
  'Native Android Chat must avoid IME with explicit height behavior');
present(android,/keyboardVerticalOffset=\{0\}/,
  'Native Chat keyboard offset must be predictable');
present(android,/Keyboard.addListener\('keyboardDidShow'/,
  'Android Chat must react to IME visibility');
present(android,/keyboardOpen && styles.screenKeyboard/,
  'Android Chat must clear nav padding while the keyboard is open');
absent(android,/<Text style=\{styles.roomTitle\}>HAVANA NICE · Chat<\/Text>/,
  'Native Chat must not show the duplicated room banner');
present(android,/\{searchOpen \? <View style=\{styles.searchRow\}>/,
  'Native Chat search must be collapsible');
absent(pwa,/<div className="room-title">/,
  'PWA Chat must not show the duplicated room banner');
present(pwa,/\{searchOpen&&<div className="chat-search">/,
  'PWA Chat search must be collapsible');
// Typing presence should follow the composer rather than occupy the fixed header.
present(android,/styles\.typingIndicator/,'Android typing indicator must appear above the composer');
present(pwa,/className="chat-typing-indicator"/,'PWA typing indicator must appear above the composer');
present(pwaStyles,/\.chat-typing-indicator\{/,'PWA styling for the typing indicator');
absent(android,/typing \|\| `\$\{connection\}/,'Android header must only show connection state');
absent(pwa,/typing \|\| `\$\{connection\}/,'PWA header must only show connection state');
// C04: presence counts from a disconnected socket are stale and must be hidden.
present(android,/connection === 'en vivo' \? ` ·/,'Android must hide online count when disconnected');
present(pwa,/connection === 'en vivo' \? ` ·/,'PWA must hide online count when disconnected');
// Android initial history should land on the latest message and respect manual scrolling.
present(android,/initialHistoryPending = useRef\(true\)/,'Native chat must track initial bottom placement');
present(android,/requestAnimationFrame\(scheduleInitialBottom\)/,'Native chat must wait for initial snapshot layout');
present(android,/scrollToEnd\(\{animated:false\}\)/,'Native chat must avoid animated initial scrolling');
present(android,/onScrollBeginDrag=/,'Native chat must respect manual scroll');
absent(android,/onContentSizeChange=\{\(\) => \{if\(autoScroll\.current\)scroll\.current\?\.scrollToEnd\(\{animated:true\}\);\}\}/,
  'Native chat must not animate every content size change');
present(android,/Responder/,'Native contextual menu must provide a reply action');
absent(android,/whatsappPlus|whatsappPlusText/,'Remove inert extra-reaction button on Android');
present(webBubble,/getBoundingClientRect\(\)/,'PWA Chat must measure held message');
present(pwa,/onLongPress=\{anchor=>showMessageMenu\(message,anchor\)\}/,
  'PWA Chat must show its contextual menu for the held message');
present(pwa,/aria-modal="true"/,'PWA contextual menu must be a dialog');
present(pwa,/Responder/,'PWA contextual menu must provide a reply action');
// C02: retain the target of the edit after app suspension/reopening.
const pwaLocal=read('apps/pwa/src/local.ts');
const androidLocal=read('apps/android/chatStorage.ts');
present(pwaLocal,/editing\?: ChatMessage \| null/,'PWA storage preserves edit context');
present(androidLocal,/editing\?: ChatMessage \| null/,'Android storage preserves edit context');
present(pwa,/editing: editingSnapshot\.current/,'PWA saves edit target');
present(android,/editing: editingSnapshot\.current/,'Android saves edit target');
present(pwa,/setEditing\(saved\.editing\)/,'PWA must restore edit mode');
present(android,/setEditing\(saved\.editing\)/,'Android must restore edit mode');
present(pwa,/editingSnapshot\.current=null;/,'PWA must clear completed edit');
present(android,/editingSnapshot\.current=null;/,'Android must clear completed edit');

// C02: edit must not lose its text when offline or on server rejection.
present(android,/editPending\.current=\{seq:editing\.seq,text\}/,'Android must await edit confirmation');
present(pwa,/editPending\.current=\{seq:editing\.seq,text\}/,'PWA must await edit confirmation');
present(android,/Conexión interrumpida\. El texto editado sigue disponible/,'Android must retain edit on disconnect');
present(pwa,/Conexión interrumpida\. El texto editado sigue disponible/,'PWA must retain edit on disconnect');
present(worker,/own\.sender_id !== senderId/,'Server must restrict edit/delete to sender');
const remove=read('cloudflare/src/message-removal.js');
present(worker,/deleteChatMessageRecord\(this.env,input.seq\)/,'Musicians must use the canonical deletion');
present(remove,/DELETE FROM chat_messages WHERE seq=\?/,'Deleting a message must remove its D1 record');
present(remove,/UPDATE chat_messages SET reply_to_seq=NULL/,'Keep replies while detaching removed originals');
present(worker,/chat.deleted/,'Chat must broadcast disappearance to clients');
present(pwa,/reconcileDeletedMessage/,'iPhone Chat must remove bubbles');
present(android,/reconcileDeletedMessage/,'Android Chat must remove bubbles');
absent(pwa,/Cerrar reacciones|>＋<\/button>/,'Remove inert extra-reaction button in PWA');
present(pwaStyles,/\.whatsapp-context\{position:absolute;/,
  'PWA menu must be anchored instead of centered');
absent(pwaStyles,/\.message-menu-overlay\{[^}]*justify-content:center/,
  'Never center contextual menu on entire PWA screen');
assert.equal((pwaStyles.match(/\{/g)||[]).length,(pwaStyles.match(/\}/g)||[]).length,
  'All PWA stylesheet braces must be balanced');

// One authenticated V2 token-hashing primitive: no copies scattered across modules.
const hashUsers=[
 'cloudflare/src/index.ts','cloudflare/src/admin-auth.js',
 'cloudflare/src/chat-media.js','cloudflare/src/family-media.js',
 'cloudflare/src/calendar-realtime.js'
];
present(read('cloudflare/src/crypto-helpers.js'),/export async function sha256Hex\(/,
 'One canonical server-side credential hash helper');
for(const path of hashUsers){
 const src=read(path);
 present(src,/import \{sha256Hex\} from '\.\/crypto-helpers\.js'/,
  path+' must use the same SHA-256 helper');
 absent(src,/\b(?:async )?function (?:hash|digest|sha256)\(/,
  path+' must not recreate a second token-hashing implementation');
}

console.log('HAVANA NICE V2 — preventive audit guard: PASS');
