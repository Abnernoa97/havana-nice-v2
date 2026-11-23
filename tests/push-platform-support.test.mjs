import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('PWA distinguishes unsupported Android contexts from iOS Home Screen requirement',()=>{
 const hook=read('apps/pwa/src/features/notices/usePwaPush.ts');
 const ui=read('apps/pwa/src/features/notices/MemberNotices.tsx');
 assert.match(hook,/function isAppleMobile\(\)/);
 assert.match(hook,/display-mode: standalone/);
 assert.match(hook,/navigator\.maxTouchPoints>1/);
 assert.match(hook,/\(!isAppleMobile\(\)\|\|installedPwa\(\)\)/);
 assert.match(hook,/\/Android\/i\.test\(navigator\.userAgent\)/);
 assert.match(hook,/no ofrece permiso para notificaciones Web Push/);
 assert.match(hook,/Prueba en Chrome/);
 assert.match(hook,/pwaPushDiagnostics/);
 assert.match(hook,/registration\.pushManager\.getSubscription/);
 assert.doesNotMatch(hook,/['\"]PushManager['\"] in window&&/);
 assert.match(ui,/pwaPushUnavailableMessage\(\)/);
 assert.doesNotMatch(ui,/Para recibir avisos en iPhone, añade HAVANA NICE a la pantalla de inicio/);
 assert.match(ui,/avisos sin leer/);
 assert.match(ui,/hn-push-diagnostics/);
 assert.match(ui,/pwaPushDiagnostics\(\)/);
 assert.doesNotMatch(ui,/>Actualizar PWA</);
 assert.doesNotMatch(ui,/updateInstalledPwa/);
 assert.match(ui,/Actualizar actividad/);
 const entry=read('apps/pwa/src/app/main.tsx');
 const worker=read('apps/pwa/public/sw.js');
 assert.match(entry,/updateViaCache:'none'/);
 assert.match(entry,/controllerchange/);
 assert.match(entry,/window\.location\.reload\(\)/);
 assert.match(worker,/havana-nice-v2-static-v5/);
 assert.match(worker,/caches\.delete/);
 assert.doesNotMatch(worker,/auth_token|localStorage\.clear\(/);
});
