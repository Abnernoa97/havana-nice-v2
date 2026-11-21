import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Only one photo layer is rendered, independently of the number of uploaded states',()=>{
 const component=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 const style=read('apps/pwa/src/features/stories/stories.css');
 assert.equal((component.match(/className="hn-story-photo"/g)||[]).length,1);
 assert.doesNotMatch(component,/<img\b|rotateY|page-next|page-previous|hn-story-image-stage/);
 assert.match(component,/new Image\(\)/); // background preload is not a visible DOM photo
 assert.match(component,/className="hn-story-canvas"/);
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
 assert.match(css,/\.hn-story-conversation\{position:absolute;bottom:0/);
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
