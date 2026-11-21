import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('iPhone and Android share the same member profile contract, no new identity',()=>{
 const contract=read('packages/shared/src/member-profile.ts');
 const server=read('cloudflare/src/modules/profile/profile.js');
 const pwa=read('apps/pwa/src/features/profile/usePwaMemberProfiles.ts');
 const native=read('apps/android/features/profile/useNativeMemberProfile.ts');
 const shell=read('apps/pwa/src/app/VisualApp.tsx');
 const android=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(contract,/\/api\/profile\/team/);
 assert.match(contract,/resolvePrivatePhotoUrl\(profile\.photoUrl,base\)/);
 assert.match(contract,/url\.origin!==new URL\(base\)\.origin/);
 assert.match(server,/new URL\(grants\[i\],workerOrigin\)\.toString\(\)/);
 assert.match(contract,/\/api\/profile\/me\/photo/);
 assert.match(server,/verifySession\(env,token\)/);
 assert.match(server,/member_profiles/);
 assert.match(server,/member_profile_grants/);
 assert.match(server,/notifyFamilyClients/);
 assert.match(pwa,/getTeamProfiles\(token\)/);
 assert.match(pwa,/uploadMyProfilePhoto\(token,result\)/);
 assert.match(native,/getTeamProfiles\(token\)/);
 assert.match(native,/\/api\/profile\/me\/photo/);
 assert.match(shell,/profile\.phase==='missing'/);
 assert.match(android,/mustAdd=profile\.phase==='missing'/);
 for(const file of [contract,pwa,native,android])
  assert.doesNotMatch(file,/startNamedChatSession|restoreNamedChatSession|\/api\/chat\/session/);
});
test('Notifications are the sixth bottom tab on both platforms, profile contains settings',()=>{
 const shared=read('packages/shared/src/memberModules.ts');
 const pwa=read('apps/pwa/src/app/VisualApp.tsx');
 const native=read('apps/android/app/NativeMemberHome.tsx');
 assert.match(shared,/id:'notices',label:'Notificaciones'/);
 assert.doesNotMatch(shared,/id:'settings'/);
 assert.match(pwa,/\['home','chat','calendar','repertoire','family','notices'\]/);
 assert.match(native,/\['home','chat','calendar','repertoire','family','notices'\]/);
 assert.match(read('apps/pwa/src/features/profile/MemberProfilePanel.tsx'),/Ajustes del perfil/);
 assert.match(native,/Ajustes del perfil/);
 const avatar=read('apps/pwa/src/features/profile/PrivateProfileAvatar.tsx');
 assert.match(avatar,/onError=/);
 assert.match(avatar,/setFailedUrl\(photoUrl\)/);
 assert.match(pwa,/retryPhoto/);
 assert.match(read('apps/pwa/src/features/home/TeamStoriesStrip.tsx'),/PrivateProfileAvatar/);
});
