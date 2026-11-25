import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Android memories open the SAME approved BOOK inline on accordion expansion',()=>{
 const cal=read('apps/android/features/calendar/NativeCalendar.tsx');
 const book=read('apps/android/features/book/NativeBook.tsx');
 const pwa=read('apps/pwa/src/features/calendar/CalendarAccordion.tsx');
 assert.match(cal,/<NativeBook embedded token=\{token\}/);
 assert.match(cal,/open===item.id/);
 assert.doesNotMatch(cal,/Abrir recuerdo con efecto BOOK|setArchive\(/);
 assert.match(book,/return embedded\?reader:<Modal/);
 assert.match(book,/source=\{\{uri:READER\}\}/);
 assert.match(book,/bookContextDeliveryScript\(nativeContext\)/);
 assert.match(pwa,/<CalendarMemories token=\{token\}/);
});

test('Android story safe space and explicit five-photo navigation do not alter BOOK',()=>{
 const story=read('apps/android/features/stories/NativeStoryViewer.tsx');
 const home=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(story,/paddingBottom:Platform.OS==='android'\?48:0/);
 assert.match(story,/Ver foto '\+\(i\+1\)/);
 assert.match(story,/setPosition\(i\)/);
 assert.match(story,/Foto siguiente/);
 assert.match(story,/Foto anterior/);
 assert.match(home,/StatusBar.currentHeight/);
 assert.doesNotMatch(story,/WebView|PageFlip/);
});

test('Android uses the same single Chat reaction method for bubble, badge and context menu',()=>{
 const timeline=read('apps/android/features/chat/NativeChatTimeline.tsx');
 const surface=read('apps/android/features/chat/NativeChatSurface.tsx');
 assert.match(timeline,/onQuickReact\(message,emoji as ChatEmoji/);
 assert.match(timeline,/Elegir reacción para mensaje/);
 assert.match(surface,/const reactWithEffect=/);
 assert.match(surface,/onQuickReact=\{reactWithEffect\}/);
 assert.match(surface,/onReact=\{reactWithEffect\}/);
 assert.doesNotMatch(timeline+surface,/new WebSocket\(|startNamedChatSession\(/);
});

test('Both notification tabs use one authenticated contract and the existing Familia signal',()=>{
 const native=read('apps/android/features/notices/NativeNotices.tsx');
 const pwa=read('apps/pwa/src/features/notices/MemberNotices.tsx');
 const contract=read('packages/shared/src/member-notifications.ts');
 const worker=read('cloudflare/src/index.ts');
 const handler=read('cloudflare/src/modules/notices/member-notifications.js');
 assert.match(read('apps/android/app/NativeMemberHome.tsx'),/<NativeNotices activity=\{activity\} push=\{push\}/);
 assert.match(read('apps/pwa/src/app/VisualApp.tsx'),/<MemberNotices token=\{token\} calendarRevision=\{calendarRevision\}/);
 const inboxHook=read('apps/android/features/notices/useNativeUnreadNotices.ts');
 assert.match(inboxHook,/getMemberNotices\(token,API,signal\)/);
 assert.match(inboxHook,/markMemberNoticesRead\(token,id\)/);
 assert.doesNotMatch(native+inboxHook,/openFamilyRealtime|new WebSocket/);
 assert.match(read('apps/android/features/profile/useNativeMemberProfile.ts'),/openFamilyRealtime\(token,false/);
 assert.match(pwa,/getMemberNotices\(token\)/);
 assert.match(pwa,/useFamilyLive\(token,false/);
 assert.match(contract,/\/api\/notices\/read/);
 assert.match(worker,/handleMemberNotices\(request,env,url,origin,verifySession\)/);
 assert.match(handler,/WHERE n.recipient_id=\?/);
 assert.match(handler,/WHERE id=\? AND recipient_id=\?/);
 assert.doesNotMatch(native+pwa+handler,/startNamedChatSession|restoreNamedChatSession|new D1Database|sendPushNotification/);
});

const noticeStoreExports={};
runInNewContext(ts.transpileModule(read('apps/android/features/notices/native-notice-inbox.ts'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{exports:noticeStoreExports,AbortController,Date,Error});
const {createNativeNoticeInbox}=noticeStoreExports;
const noticeData=unread=>({items:[],unread});
test('One inbox supplies warm reopens and concurrent badge/bandeja refreshes',async()=>{
 let now=100,calls=0,resolve;
 const store=createNativeNoticeInbox(()=>{calls++;return new Promise(r=>{resolve=r;});},async()=>{},()=>false,()=>now);
 store.setActive(true);
 const first=store.refresh(),second=store.refresh();
 assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 resolve(noticeData(8));await first;
 for(let i=0;i<20;i++)await store.refresh();
 assert.equal(calls,1);assert.equal(store.getSnapshot().inbox.unread,8);
 now+=30_001;const next=store.refresh();await Promise.resolve();resolve(noticeData(9));await next;
 assert.equal(calls,2);assert.equal(store.getSnapshot().inbox.unread,9);
});
test('Server read confirmation updates one authoritative badge and ignores old GET',async()=>{
 let calls=0,resolve,writes=0;
 const store=createNativeNoticeInbox(async()=>{
  calls++;if(calls===1)return new Promise(r=>{resolve=r;});
  return noticeData(0);
 },async()=>{writes++;},()=>false);
 store.setActive(true);
 const old=store.refresh();await Promise.resolve();
 const marking=store.mark('id');await Promise.resolve();
 resolve(noticeData(8));await old;await marking;
 assert.equal(calls,2);assert.equal(writes,1);assert.equal(store.getSnapshot().inbox.unread,0);
 assert.equal(store.getSnapshot().marking,false);
});
test('Inactive inbox aborts reads and cannot commit an old session response',async()=>{
 let resolve,signal;
 const store=createNativeNoticeInbox(s=>{signal=s;return new Promise(r=>{resolve=r;});},async()=>{},()=>false);
 store.setActive(true);const old=store.refresh();await Promise.resolve();
 store.setActive(false);assert.equal(signal.aborted,true);
 resolve(noticeData(20));await old;assert.equal(store.getSnapshot().inbox,null);
 const other=createNativeNoticeInbox(async()=>noticeData(1),async()=>{},()=>false);
 other.setActive(true);await other.refresh();assert.equal(other.getSnapshot().inbox.unread,1);
});
test('Network failure retains known unread count but authorization error clears private inbox',async()=>{
 let mode=0;
 const store=createNativeNoticeInbox(async()=>{
  if(mode===1)throw Error('network');
  if(mode===2)throw Error('401');
  return noticeData(5);
 },async()=>{},error=>error.message==='401');
 store.setActive(true);await store.refresh();
 mode=1;await store.refresh(true);assert.equal(store.getSnapshot().inbox.unread,5);
 mode=2;await store.refresh(true);assert.equal(store.getSnapshot().inbox,null);
});
test('Read buttons serialize writes and failed writes do not fabricate a new count',async()=>{
 let writes=0,resolve;
 const store=createNativeNoticeInbox(async()=>noticeData(6),()=>{writes++;return new Promise(r=>{resolve=r;});},()=>false);
 store.setActive(true);await store.refresh();
 const first=store.mark('one');await store.mark('two');assert.equal(writes,1);
 resolve();await first;assert.equal(store.getSnapshot().inbox.unread,6);
 const failed=createNativeNoticeInbox(async()=>noticeData(7),async()=>{throw Error('no');},()=>false);
 failed.setActive(true);await failed.refresh();await failed.mark();
 assert.equal(failed.getSnapshot().inbox.unread,7);assert.equal(failed.getSnapshot().error,'no');
});
test('Native foreground inbox owns one polling loop, no push changes or screen fetches',()=>{
 const hook=read('apps/android/features/notices/useNativeUnreadNotices.ts');
 const view=read('apps/android/features/notices/NativeNotices.tsx');
 const home=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(home,/const unreadNotices=activity\.unread/);
 assert.match(home,/<NativeNotices activity=\{activity\} push=\{push\}/);
 assert.match(hook,/useMemo\(\(\)=>createNativeNoticeInbox/);
 assert.match(hook,/const update=\(state:string\|null\|undefined\)=>/);
 assert.match(hook,/store\.setActive\(state==='active'\)/);
 assert.match(hook,/getMemberNotices\(token,API,signal\)/);
 assert.match(hook,/store\.setActive\(false\);listener\.remove\(\);clearInterval\(fallback\)/);
 assert.equal((hook.match(/setInterval\(/g)||[]).length,1);
 assert.doesNotMatch(view,/getMemberNotices|markMemberNoticesRead|openFamilyRealtime|setInterval|useEffect/);
 assert.match(view,/disabled=\{marking\} onPress=\{\(\)=>void mark\(item\.id\)\}/);
});
