import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Android FCM is part of the SINGLE native shell, not a new login or Chat socket',()=>{
 const hook=read('apps/android/features/notices/useNativePush.ts');
 const shell=read('apps/android/features/chat/NativeChatSurface.tsx');
 const home=read('apps/android/app/NativeMemberHome.tsx');
 const notices=read('apps/android/features/notices/NativeNotices.tsx');
 assert.match(shell,/useNativePush\(session\?\.token\?\?null,navigateTo\)/);
 assert.match(shell,/onNavigate=\{navigateTo\} push=\{push\}/);
 assert.match(home,/active==='notices'\?<NativeNotices/);
 assert.match(notices,/push\.enable\(\)/);
 assert.match(notices,/push\.disable\(\)/);
 assert.match(hook,/Notifications\.getDevicePushTokenAsync\(\)/);
 assert.match(hook,/Notifications\.addPushTokenListener/);
 assert.match(hook,/Notifications\.addNotificationResponseReceivedListener/);
 assert.match(hook,/Notifications\.getLastNotificationResponseAsync/);
 assert.match(hook,/Notifications\.setNotificationChannelAsync/);
 assert.match(hook,/Notifications\.requestPermissionsAsync\(\)/);
 assert.match(hook,/Storage\.setItem\(PUSH_DISABLED_KEY,'1'\)/);
 assert.match(hook,/Storage\.getItem\(PUSH_DISABLED_KEY\)/);
 assert.match(hook,/requestPush\(token,'POST','\/api\/push\/test'\)/);
 assert.match(notices,/push\.test\(\)/);
 assert.match(hook,/Notifications\.getPermissionsAsync\(\)/);
 assert.match(hook,/Authorization:'Bearer '\+token/);
 assert.match(hook,/platform:'android-fcm'/);
 assert.doesNotMatch(hook,/getExpoPushTokenAsync|AsyncStorage|WebSocket|createChatSession/);
});
test('Native config points to the existing Firebase project and never builds prematurely',()=>{
 const packageJson=JSON.parse(read('apps/android/package.json'));
 const config=JSON.parse(read('apps/android/app.json')).expo;
 const batch=JSON.parse(read('releases/android-batch.json'));
 assert.equal(packageJson.dependencies['expo-notifications'],'58.1.6');
 assert.equal(config.android.googleServicesFile,'./google-services.json');
 assert.ok(config.plugins.some(entry=>Array.isArray(entry)&&
  entry[0]==='expo-notifications'&&entry[1]?.defaultChannel==='havana-team-activity'));
 assert.equal(config.version,'0.0.29');
 assert.equal(config.android.versionCode,29);
 assert.equal(batch.version,'0.0.29');
 assert.equal(batch.versionCode,29);
});
test('Worker provider channel matches the Android channel and iPhone uses standard push',()=>{
 const sender=read('cloudflare/src/modules/notices/push-delivery.js');
 const native=read('apps/android/features/notices/useNativePush.ts');
 const sw=read('apps/pwa/public/sw.js');
 assert.match(sender,/channel_id:'havana-team-activity'/);
 assert.match(native,/HAVANA_PUSH_CHANNEL='havana-team-activity'/);
 assert.match(sender,/fcm\.googleapis\.com\/v1\/projects/);
 assert.match(sender,/Content-Encoding':'aes128gcm/);
 assert.match(sw,/registration\.showNotification/);
 assert.match(sw,/notificationclick/);
});
