import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('One mobile viewport policy across PWA, visual, administrator and native BOOK entrypoints',()=>{
 const entries=['main.tsx','visual-main.tsx','admin-main.tsx','native-book-main.tsx'];
 const css=read('apps/pwa/src/styles/mobile-viewport.css');
 for(const name of entries)
  assert.match(read('apps/pwa/src/app/'+name),/import '\.\.\/styles\/mobile-viewport\.css'/);
 assert.match(css,/touch-action:manipulation/);
 assert.match(css,/-webkit-text-size-adjust:100%/);
 assert.match(css,/textarea,select\{font-size:16px!important\}/);
 assert.doesNotMatch(css,/touch-action:none|overscroll-behavior:none|preventDefault\(/);
 for(const html of ['index.html','visual.html','admin.html','book.html'])
  assert.match(read('apps/pwa/'+html),/viewport-fit=cover/);
});

test('Story viewport fixes image height and moves only the small composer with Safari keyboard',()=>{
 const viewer=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 const style=read('apps/pwa/src/features/stories/stories.css');
 const hook=read('apps/pwa/src/features/stories/useStoryKeyboardViewport.ts');
 assert.match(viewer,/useStoryKeyboardViewport\(\)/);
 assert.match(viewer,/--hn-story-fixed-height/);
 assert.match(viewer,/--hn-story-keyboard-inset/);
 assert.match(style,/height:var\(--hn-story-fixed-height,100dvh\)/);
 assert.match(style,/bottom:var\(--hn-story-keyboard-inset,0px\)/);
 assert.match(hook,/window\.visualViewport/);
 assert.match(hook,/focusin/);
 assert.match(hook,/focusout/);
 assert.doesNotMatch(hook,/new WebSocket|localStorage|document\.body\.style\.zoom/);
});

test('Voice action hides all other actions without remounting Safari MediaRecorder',()=>{
 const panel=read('apps/pwa/src/features/stories/StoryConversationPanel.tsx');
 const styles=read('apps/pwa/src/features/stories/stories.css');
 const voice=read('apps/pwa/src/features/stories/StoryVoiceRecorder.tsx');
 assert.match(panel,/className=\{"hn-story-conversation"\+\(recording\?" is-recording":""\)\}/);
 assert.match(styles,/\.hn-story-conversation\.is-recording \.hn-story-mini-actions/);
 assert.match(styles,/\.hn-story-conversation\.is-recording \.hn-story-voice\{display:flex;justify-content:center/);
 assert.match(styles,/\.hn-story-composer\.is-recording input/);
 assert.equal((panel.match(/<StoryVoiceRecorder /g)||[]).length,1);
 assert.match(voice,/Grabando voz/);
 assert.match(voice,/Cancelar/);
 assert.match(voice,/Enviar voz/);
});

test('Only optimized private JPEGs are uploaded, at most five, target 450KB',()=>{
 const prepare=read('apps/pwa/src/features/stories/prepareStoryPhoto.ts');
 const uploader=read('apps/pwa/src/features/stories/useMemberStories.ts');
 const shared=read('packages/shared/src/member-stories.ts');
 assert.match(prepare,/canvas\.width=720;canvas\.height=1280/);
 assert.match(prepare,/canvas\.toBlob/);
 assert.match(prepare,/450_000/);
 assert.match(prepare,/0\.74/);
 assert.match(prepare,/0\.63,0\.53,0\.44/);
 assert.match(prepare,/canvas\.width=0;canvas\.height=0/);
 assert.match(shared,/STORY_BATCH_MAX=5/);
 assert.match(uploader,/await prepareStoryPhoto\(file\)/);
 assert.match(uploader,/uploadMyStoriesBatch\(token,images\)/);
 assert.doesNotMatch(uploader,/new WebSocket|startNamedChatSession/);
});

test('Calendar remembrance 3D uses persistent BookReader and optimized WebP, not Stories',()=>{
 const calendar=read('apps/pwa/src/features/calendar/CalendarMemories.tsx');
 const admin=read('apps/pwa/src/features/calendar/AdminCalendarMemories.tsx');
 const book=read('apps/pwa/src/features/book/BookReader.tsx');
 const story=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 assert.match(calendar,/BookReader edition="calendar"/);
 assert.match(admin,/optimizeBookPhoto/);
 assert.match(book,/new PageFlip/);
 assert.match(book,/autoSize:false/);
 assert.doesNotMatch(story,/PageFlip|BookReader|rotateY|page-flip/);
});
