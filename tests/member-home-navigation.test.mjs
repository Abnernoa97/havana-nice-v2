import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('One shared list of member HOME destinations, not a second access mechanism',()=>{
 const modules=read('packages/shared/src/memberModules.ts');
 for(const name of ['chat','calendar','repertoire','musicians','family','notices','settings'])
   assert.match(modules,new RegExp("id:'"+name+"'"));
 assert.match(modules,/ready:true/);
 assert.doesNotMatch(modules,/token|password|startNamedChatSession|restoreNamedChatSession/);
});
test('Existing Android login and Chat engine stay in one mounted App',()=>{
 const source=read('apps/android/app/NativeApp.tsx');
 assert.match(source,/startNamedChatSession\(name\.trim\(\)\)/);
 assert.match(source,/restoreNamedChatSession/);
 assert.match(source,/session&&activeScreen!=='chat'&&<NativeMemberHome/);
 assert.match(source,/session && activeScreen!=='chat' && styles\.inactiveChat/);
 assert.match(read('apps/android/styles/chat-styles.ts'),/inactiveChat:\{display:'none'\}/);
 assert.match(source,/accessibilityLabel="Volver a Inicio"/);
 assert.doesNotMatch(read('apps/android/app/NativeMemberHome.tsx'),/startNamedChatSession|AsyncStorage|WebView|session\.token|fetch\(/);
});
test('Android styles live outside Chat controller without changing navigation or IME safety',()=>{
 const app=read('apps/android/app/NativeApp.tsx');
 const styles=read('apps/android/styles/chat-styles.ts');
 assert.match(app,/import \{styles\} from '\.\.\/styles\/chat-styles'/);
 assert.match(app,/const keyboardOpen=useNativeKeyboardVisibility\(\)/);
 assert.match(read('apps/android/hooks/useNativeKeyboardVisibility.ts'),/Keyboard.addListener\('keyboardDidHide'/);
 assert.doesNotMatch(app,/StyleSheet\.create\(/);
 assert.match(styles,/export const styles = StyleSheet\.create\(/);
 assert.match(styles,/inactiveChat:\{display:'none'\}/);
 assert.match(styles,/paddingBottom: Platform\.OS === 'android' \? 42 : 0/);
 assert.match(styles,/screenKeyboard: \{paddingBottom:0\}/);
 assert.match(styles,/composer:\{flexDirection:'row'/);
 assert.doesNotMatch(styles,/ChatSession|WebSocket|useState|AsyncStorage|fetch\(/);
});
test('Existing PWA login remains canonical and HOME only mounts after authenticated session',()=>{
 const source=read('apps/pwa/src/app/App.tsx');
 assert.match(source,/startNamedChatSession\(name\.trim\(\)\)/);
 assert.match(source,/restoreNamedChatSession/);
 assert.match(source,/session&&activeScreen!=='chat'&&<Suspense/);
 assert.match(source,/<VisualApp displayName=/);
 assert.match(source,/member-chat-hidden/);
 assert.match(read('apps/pwa/src/styles/chat/chat.css'),/\.member-chat-hidden\{display:none\}/);
 assert.match(read('apps/pwa/src/app/main.tsx'),/import '\.\.\/styles\/home\/home\.css'/);
 assert.doesNotMatch(read('apps/pwa/src/app/VisualApp.tsx'),/startNamedChatSession|restoreNamedChatSession|localStorage|indexedDB|adminLogin|\/api\/chat\/session/);
});
test('Visual preview cannot independently open protected Chat',()=>{
 const visual=read('apps/pwa/src/app/VisualApp.tsx');
 const preview=read('apps/pwa/src/app/visual-main.tsx');
 assert.match(preview,/<VisualApp preview \/>/);
 assert.match(visual,/if\(target==='chat'&&!onNavigate\)return/);
 assert.doesNotMatch(visual,/new WebSocket|admin\.html/);
});

test('PWA and Android availability remain truthful without duplicating HOME',()=>{
 const data=read('packages/shared/src/memberModules.ts');
 assert.match(data,/description:string;ready:boolean;nativeReady:boolean/);
 assert.match(data,/id:'repertoire'[^\n]*ready:true,nativeReady:true/);
 assert.match(data,/id:'calendar'[^\n]*ready:true,nativeReady:true/);
 assert.match(read('apps/pwa/src/app/VisualApp.tsx'),/item\.ready\?'DISPONIBLE':'EN PREPARACIÓN'/);
 assert.match(read('apps/android/app/NativeMemberHome.tsx'),/module\.nativeReady\?'Disponible':'En preparación'/);
});
