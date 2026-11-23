import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const member=read('cloudflare/src/modules/notices/member-event-notices.js');
const admin=read('cloudflare/src/modules/notices/member-system-notices.js');
const inbox=read('cloudflare/src/modules/notices/member-notifications.js');
const center=read('cloudflare/src/modules/notices/push-center.js');
const delivery=read('cloudflare/src/modules/notices/push-delivery.js');
const copy=read('cloudflare/src/modules/notices/push-copy.js');

test('One backward-compatible notices facade with separated event, Admin and inbox responsibilities',()=>{
 assert.match(inbox,/from '\.\/member-event-notices\.js'/);
 assert.match(inbox,/from '\.\/member-system-notices\.js'/);
 assert.match(inbox,/export async function handleMemberNotices/);
 assert.match(inbox,/WHERE n\.recipient_id=\?/);
 assert.match(inbox,/WHERE id=\? AND recipient_id=\?/);
 assert.doesNotMatch(inbox,/export async function notifyMember/);
 assert.doesNotMatch(inbox,/export async function notifyBookPublished/);
 assert.match(member,/export async function notifyMember/);
 assert.match(member,/export async function notifyTeamChatMessage/);
 assert.match(member,/export async function notifyTeamStoryPublished/);
 assert.match(member,/memberPushCopy/);
 assert.doesNotMatch(member,/export async function notifyCalendarMembers/);
 assert.doesNotMatch(member,/export async function notifyBookPublished/);
 for(const symbol of ['notifyRepertoireMembers','notifyGeneralRepertoireMembers','notifyBookPublished','notifyCalendarMembers'])
  assert.match(admin,new RegExp('export async function '+symbol));
 assert.doesNotMatch(admin,/export async function notifyMember/);
 assert.doesNotMatch(admin,/new WebSocket|startNamedChatSession/);
});
test('Only the push transport sends devices messages; only center registers device tokens',()=>{
 assert.match(center,/export async function queueNoticePush/);
 assert.match(center,/export async function handleMemberPushApi/);
 assert.match(delivery,/export async function sendFcmPush/);
 assert.match(delivery,/export async function sendWebPush/);
 assert.match(delivery,/export async function dispatchDuePush/);
 for(const src of [member,admin,inbox,copy]){
  assert.doesNotMatch(src,/fcm\.googleapis\.com\/v1\/projects|FCM_SERVICE_ACCOUNT_JSON|PUSH_VAPID_PRIVATE_KEY/);
  assert.doesNotMatch(src,/new WebSocket|new DurableObject|new D1Database/);
 }
});
test('Published notices never expose private Chat payloads or token data on locked phones',()=>{
 assert.match(copy,/memberPushCopy/);
 assert.match(copy,/actorName/);
 assert.doesNotMatch(copy,/FCM_SERVICE_ACCOUNT_JSON|PUSH_VAPID_PRIVATE_KEY|R2_URL/);
 assert.match(member,/SELECT display_name FROM chat_members/);
 assert.match(member,/dedupeKey/);
 assert.match(admin,/book:published:/);
 assert.match(admin,/repertoire:general:/);
 assert.match(admin,/calendar:/);
});
test('Installed Android still owns one FCM channel and same BOOK reader',()=>{
 const android=read('apps/android/features/notices/useNativePush.ts');
 const book=read('apps/android/features/book/NativeBook.tsx');
 assert.match(android,/HAVANA_PUSH_CHANNEL='havana-team-activity'/);
 assert.match(android,/getDevicePushTokenAsync/);
 assert.match(book,/source=\{\{uri:READER\}\}/);
 assert.doesNotMatch(android,/new WebSocket/);
});
