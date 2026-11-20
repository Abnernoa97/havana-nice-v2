// Complete PWA source graph for source-invariant tests after modularizing the
// sole Chat controller, navigation, media progress and visual presentation.
import {readFileSync} from 'node:fs';
export const PWA_CHAT_FILES=[
 'apps/pwa/src/app/App.tsx',
 'apps/pwa/src/features/chat/usePwaChatController.ts',
 'apps/pwa/src/app/usePwaMemberNavigation.ts',
 'apps/pwa/src/features/chat/usePwaChatMediaUpload.ts',
 'apps/pwa/src/features/chat/PwaChatSurface.tsx',
];
export function readPwaSource(fromUrl){
 return PWA_CHAT_FILES.map(path=>readFileSync(new URL('../'+path,fromUrl),'utf8')).join('\n');
}
