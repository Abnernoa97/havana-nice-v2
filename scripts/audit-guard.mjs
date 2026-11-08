import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
// A separate repository must contain only V2 source, never the original app.
const allowedRoot=new Set(['.git','.github','.gitignore','.env.example','README.md',
 'apps','cloudflare','packages','docs','scripts','tests',
 'package.json','package-lock.json','tsconfig.base.json']);
assert.deepEqual(readdirSync(new URL('../',import.meta.url)).filter(x=>!allowedRoot.has(x)),
 [],'Standalone V2 repository cannot include original app files');
const worker = read('cloudflare/src/index.ts');
const chatRoom = read('cloudflare/src/modules/chat/chat-room.ts');
const chatSession = read('cloudflare/src/modules/chat/chat-session.ts');
assert.doesNotMatch(worker,/\/\/\s*@ts-nocheck\b/,'V2 Worker entrypoint must remain strictly typechecked');
const android = read('apps/android/App.tsx');
const pwa = read('apps/pwa/src/app/App.tsx');
const nativeBubble = read('apps/android/features/chat/SwipeableBubble.tsx');
const nativeTimeline = read('apps/android/features/chat/NativeChatTimeline.tsx');
const webBubble = read('apps/pwa/src/features/chat/SwipeMessage.tsx');
const pwaStyles = read('apps/pwa/src/styles/chat/chat.css');
const serviceWorker = read('apps/pwa/public/sw.js');
const workerConfig = read('cloudflare/wrangler.jsonc');
const androidWorkflow = read('.github/workflows/v2-android-apk.yml');
const workflows=readdirSync(new URL('../.github/workflows/',import.meta.url)).sort();
assert.deepEqual(workflows,['v2-android-apk.yml','v2-foundation-check.yml'],
  'V2 must have one release workflow and one verification workflow, no historical automation');
const reproducibleWorker=JSON.parse(workerConfig);
const cloudflarePackage=JSON.parse(read('cloudflare/package.json'));
const foundationWorkflow=read('.github/workflows/v2-foundation-check.yml');
// A normal release must come from the checked-in Wrangler entrypoint, not an
// edited compiled index.js, a second Worker, or a direct-version API upload.
assert.equal(reproducibleWorker.main,'./src/index.ts',
  'Only the canonical TypeScript Worker entrypoint may be compiled');
assert.equal(reproducibleWorker.name,'havana-nice-v2-dev',
  'Do not introduce a parallel Worker for V2');
assert.equal(cloudflarePackage.scripts?.deploy,'wrangler deploy',
  'Production Worker updates must use Wrangler from committed source');
assert.match(foundationWorkflow,/wrangler deploy --dry-run --outdir \/tmp\/havana-v2-worker-preview/,
  'Every V2 release candidate must compile through canonical Wrangler dry run');
assert.match(foundationWorkflow,/sha256sum "\$BUNDLE"/,
  'The exact compiled Worker candidate must receive an auditable checksum');
assert.match(foundationWorkflow,/actions\/upload-artifact@v4/,
  'The compiled Worker candidate must remain available for version comparison');
assert.match(foundationWorkflow,/verify-worker-preview\.mjs "\$BUNDLE"/,
  'Canonical compiled Worker invariant guard must run before release');
assert.match(foundationWorkflow,/worker-release-preflight\.mjs "\$BUNDLE"/,
  'Wrangler config, seven binding names and source SHA must be validated before release');
assert.match(foundationWorkflow,/node --test tests\/worker-hash-parity\.test\.mjs/,
  'SHA-256 compatibility with existing private grants must remain proven');
assert.doesNotMatch(foundationWorkflow,/workers\/scripts\/[^\s]+\/versions[^\s]*\s+-X\s+POST/,
  'Do not reintroduce direct compiled Worker version uploads in CI');
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
present(chatSession,/JOIN chat_members/,'Worker must validate the enabled member on session reuse');
present(chatSession,/active=1/,'Worker must deny revoked names');
present(chatRoom,/chat\.revoked/,'Worker must notify active sessions when access is revoked');
// Exactly one cross-origin policy for PWA and administrator.
// A DELETE preflight is required by Chrome/Safari before the moderator can remove a message.
present(worker,/'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS'/,
 'Chat Admin delete-for-all must remain permitted in the central CORS preflight');
assert.equal((worker.match(/'access-control-allow-methods':/g)||[]).length,1,
 'Single Worker must own one CORS allow-methods declaration');
// One name, one installation: the discarded approvals implementation must not
// survive in source, migrations, UI, or routes.
const adminAuth=read('cloudflare/src/modules/admin/admin-auth.js');
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
const installation=read('cloudflare/src/modules/admin/single-installation.js');
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
absent(read('cloudflare/src/modules/admin/single-installation.js'),/single_device_mode/,
  'The owner record must be the only musician installation policy');
absent(read('apps/pwa/src/features/admin/AdminChatAccess.tsx'),/single_device_mode|Acceso anterior protegido/,
  'Administrator cannot show or enforce historical alternative access');
absent(read('apps/pwa/src/services/admin-api.ts'),/single_device_mode/,
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
present(androidWorkflow,/gh release upload v2-android-current/,'APK releases must stay in the independent V2 repository');
present(androidWorkflow,/HAVANA-NICE-V2-LATEST\.apk/,'One stable APK download filename');
const androidConfig=JSON.parse(read('apps/android/app.json'));
assert.equal(androidConfig.expo.android.package,'com.havananice.v2',
  'H01: never change Android package ID');
assert.ok(Number.isInteger(androidConfig.expo.android.versionCode) && androidConfig.expo.android.versionCode >= 2,
  'H01: release APK needs explicit Android versionCode');
present(androidWorkflow,/EXPECTED_CODE/,'H01: verify actual APK versionCode matches app config');
const apkSignerGate=read('scripts/apk-signature-gate.py');
present(androidWorkflow,/python3 scripts\/apk-signature-gate\.py/,
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
present(android,/onMessageLongPress=\{showMessageMenu\}/,
  'Native Chat controller must pass its single contextual-menu action to the timeline');
present(nativeTimeline,/onLongPress=\{\(anchor\) => onMessageLongPress\(message,anchor\)\}/,
  'Native Chat timeline must forward the actual measured bubble to the single controller');
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
const chatTimeline=read('apps/pwa/src/features/chat/ChatTimeline.tsx');
present(pwa,/onMessageLongPress=\{showMessageMenu\}/,
  'PWA Chat must bind the existing secure contextual menu from App');
present(chatTimeline,/onLongPress=\{anchor=>onMessageLongPress\(message,anchor\)\}/,
  'PWA Timeline must forward long-press anchors to the one Chat controller');
present(pwa,/aria-modal="true"/,'PWA contextual menu must be a dialog');
present(pwa,/Responder/,'PWA contextual menu must provide a reply action');
// C02: retain the target of the edit after app suspension/reopening.
const pwaLocal=read('apps/pwa/src/services/local.ts');
const androidLocal=read('apps/android/services/chatStorage.ts');
present(pwaLocal,/editing\?: ChatMessage \| null/,'PWA storage preserves edit context');
present(androidLocal,/editing\?: ChatMessage \| null/,'Android storage preserves edit context');
const sharedOffline=read('packages/shared/src/chat-offline.ts');
present(sharedOffline,/editing,beforeEdit/,'Canonical offline snapshot preserves pending edit target');
present(sharedOffline,/message\.clientMessageId/,'Canonical restore must preserve message IDs');
present(pwa,/captureChatOfflineSnapshot\(/,'PWA persists through one shared offline serializer');
present(android,/captureChatOfflineSnapshot\(/,'Android persists through one shared offline serializer');
present(pwa,/editingSnapshot\.current,beforeEdit\.current/,'PWA saves edit target with composer draft');
present(android,/editingSnapshot\.current,beforeEdit\.current/,'Android saves edit target with composer draft');
present(pwa,/setEditing\(saved\.editing\)/,'PWA must restore edit mode');
present(android,/setEditing\(saved\.editing\)/,'Android must restore edit mode');
present(pwa,/editingSnapshot\.current=null;/,'PWA must clear completed edit');
present(android,/editingSnapshot\.current=null;/,'Android must clear completed edit');

// C02: edit must not lose its text when offline or on server rejection.
present(android,/editPending\.current=\{seq:editing\.seq,text\}/,'Android must await edit confirmation');
present(pwa,/editPending\.current=\{seq:editing\.seq,text\}/,'PWA must await edit confirmation');
present(android,/Conexión interrumpida\. El texto editado sigue disponible/,'Android must retain edit on disconnect');
present(pwa,/Conexión interrumpida\. El texto editado sigue disponible/,'PWA must retain edit on disconnect');
present(chatRoom,/own\.sender_id !== senderId/,'Server must restrict edit/delete to sender');
const remove=read('cloudflare/src/modules/chat/message-removal.js');
present(chatRoom,/deleteChatMessageRecord\(this.env,input.seq\)/,'Musicians must use the canonical deletion');
present(remove,/DELETE FROM chat_messages WHERE seq=\?/,'Deleting a message must remove its D1 record');
present(remove,/UPDATE chat_messages SET reply_to_seq=NULL/,'Keep replies while detaching removed originals');
present(chatRoom,/chat.deleted/,'Chat must broadcast disappearance to clients');
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
 'cloudflare/src/index.ts','cloudflare/src/modules/chat/chat-session.ts','cloudflare/src/modules/admin/admin-auth.js',
 'cloudflare/src/modules/chat/chat-media.js','cloudflare/src/modules/family/family-media.js',
 'cloudflare/src/modules/calendar/calendar-realtime.js'
];
present(read('cloudflare/src/shared/crypto-helpers.js'),/export async function sha256Hex\(/,
 'One canonical server-side credential hash helper');
for(const path of hashUsers){
 const src=read(path);
 present(src,/import \{sha256Hex\} from '(?:\.\/shared\/|\.\.\/\.\.\/shared\/)crypto-helpers\.js'/,
  path+' must use the same SHA-256 helper');
 absent(src,/\b(?:async )?function (?:hash|digest|sha256)\(/,
  path+' must not recreate a second token-hashing implementation');
}

console.log('HAVANA NICE V2 — preventive audit guard: PASS');
