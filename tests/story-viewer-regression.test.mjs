import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Story dialogs escape HOME stacking and scrolling contexts, covering brand and bottom nav',()=>{
 const stories=read('apps/pwa/src/features/stories/MemberStories.tsx');
 const css=read('apps/pwa/src/features/stories/stories.css');
 assert.match(stories,/import \{createPortal\} from 'react-dom'/);
 assert.match(stories,/createPortal\(<div className="hn-story-overlay"/);
 assert.match(stories,/createPortal\(\s*<MemberStoryViewer/);
 assert.equal((stories.match(/document\.body\)/g)||[]).length,2);
 assert.match(css,/\.hn-story-overlay\{position:fixed;inset:0;z-index:10000/);
 const home=read('apps/pwa/src/features/home/home-stage.css');
 assert.doesNotMatch(home,/\.hn-story-overlay\{/);
});

test('Only one photo layer is rendered, independently of the number of uploaded states',()=>{
 const component=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 const style=read('apps/pwa/src/features/stories/stories.css');
 const surface=read('apps/pwa/src/features/stories/StoryPhotoSurface.tsx');
 assert.equal((surface.match(/className="hn-story-photo"/g)||[]).length,1);
 assert.match(surface,/memo\(function StoryPhotoSurface/);
 assert.match(component,/StoryPhotoSurface id=\{item.id\}/);
 assert.doesNotMatch(component,/<img\b|rotateY|page-next|page-previous|hn-story-image-stage/);
 assert.match(component,/new Image\(\)/); // background preload is not a visible DOM photo
 assert.match(surface,/className="hn-story-canvas"/);
 assert.match(style,/\.hn-story-canvas\{position:absolute;inset:0/);
 assert.match(style,/\.hn-story-photo\{position:absolute;inset:0/);
 assert.match(style,/background-size:contain/);
 assert.match(style,/transform:none;animation:none/);
 assert.doesNotMatch(style,/rotateY|perspective|@keyframes hn-story-turn/);
});

test('Top progress segments visibly fill and advance from one 6s timer',()=>{
 const component=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 const playback=read('apps/pwa/src/features/stories/useStoryPlayback.ts');
 const css=read('apps/pwa/src/features/stories/stories.css');
 assert.match(component,/items.map\(\(story,index\)=>/);
 assert.match(component,/index<position\?100:index===position\?progress:0/);
 assert.match(component,/useStoryPlayback\(item\?\.id,paused,next\)/);
 assert.match(component,/commentPaused/);
 assert.match(playback,/STORY_PLAYBACK_MS/);
 assert.match(playback,/elapsed\.current\+now-previous\.current/);
 assert.match(playback,/if\(!storyId\|\|paused\)return/);
 assert.match(playback,/latest\.current\(\)/);
 assert.match(css,/\.hn-story-progress\{position:absolute/);
 assert.match(css,/top:calc\(10px \+ env\(safe-area-inset-top\)\)/);
 assert.match(css,/z-index:20/);
 assert.doesNotMatch(playback+component,/onAnimationEnd|animationPlayState|CSSStyleRule/);
});

test('No footer occupies image height; small comments, text, voice and 3 reactions overlay',()=>{
 const component=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 const panel=read('apps/pwa/src/features/stories/StoryConversationPanel.tsx');
 const css=read('apps/pwa/src/features/stories/stories.css');
 assert.match(css,/\.hn-story-conversation\{position:absolute;bottom:var\(--hn-story-keyboard-inset,0px\)/);
 assert.match(css,/\.hn-story-comments-sheet\{position:absolute/);
 assert.match(css,/bottom:calc\(100% \+ 7px\)/);
 assert.match(css,/\.hn-story-composer\{display:flex/);
 assert.match(panel,/const reactions:StoryEmoji\[\]=\['❤️','👏','😂'\]/);
 assert.match(panel,/placeholder="Comentar…"/);
 assert.match(panel,/StoryVoiceRecorder/);
 assert.match(panel,/aria-expanded=\{expanded\}/);
 assert.match(component,/StoryConversationPanel/);
 assert.doesNotMatch(css,/\.hn-story-conversation\{flex:none/);
 assert.doesNotMatch(component,/hn-story-step-controls/);
});

test('Other sections keep their own entry and no additional Chat connection is created',()=>{
 const component=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 const css=read('apps/pwa/src/features/stories/stories.css');
 const playback=read('apps/pwa/src/features/stories/useStoryPlayback.ts');
 for(const part of [component,css,playback])
  assert.doesNotMatch(part,/new WebSocket|openChatSocket|startNamedChatSession|saveLocalChat|page-flip|PageFlip/);
 assert.match(read('apps/pwa/src/app/VisualApp.tsx'),/const MemberHome=lazy/);
 assert.match(read('apps/pwa/src/features/stories/StoryReactionShower.tsx'),/makeChatReactionParticles/);
});

test('Reactions reuse the same photo grant and a memoized canvas, never a new image',()=>{
 const controller=read('apps/pwa/src/features/stories/useMemberStories.ts');
 const surface=read('apps/pwa/src/features/stories/StoryPhotoSurface.tsx');
 const viewport=read('apps/pwa/src/features/stories/useStoryKeyboardViewport.ts');
 assert.match(controller,/photoGrants=useRef\(new Map/);
 assert.match(controller,/now-saved\.issuedAt<8\*60\*1000/);
 assert.match(controller,/return \{\.\.\.story,photoUrl:saved\.url\}/);
 assert.match(controller,/photoGrants\.current\.delete\(id\)/);
 assert.match(surface,/memo\(function StoryPhotoSurface/);
 assert.doesNotMatch(surface,/useStoryConversation|useStoryPlayback|useState|refreshVersion/);
 assert.match(viewport,/window\.visualViewport/);
 assert.match(viewport,/viewport\.addEventListener\('resize',update\)/);
});
