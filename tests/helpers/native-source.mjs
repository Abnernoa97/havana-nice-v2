// Canonical native code graph for source-invariant tests after separating the
// screen, navigation and timeline from the sole session/transport controller.
import {readFileSync} from 'node:fs';
export const NATIVE_CHAT_FILES=[
 'apps/android/app/NativeApp.tsx',
 'apps/android/features/chat/useNativeChatController.ts',
 'apps/android/features/chat/useNativeChatMediaUpload.ts',
 'apps/android/features/chat/NativeChatSurface.tsx',
 'apps/android/features/chat/useNativeChatViewport.ts',
 'apps/android/hooks/useNativeMemberNavigation.ts',
];
export function readNativeSource(fromUrl){
 return NATIVE_CHAT_FILES.map(path=>readFileSync(new URL('../'+path,fromUrl),'utf8')).join('\n');
}
