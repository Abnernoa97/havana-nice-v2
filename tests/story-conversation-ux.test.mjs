import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Circular HOME thumbnails crop story images while Profile remains an independent permanent photo',()=>{
 const css=read('apps/pwa/src/features/home/home-stage.css');
 const strip=read('apps/pwa/src/features/home/TeamStoriesStrip.tsx');
 assert.match(css,/\.hn-moment-photo img\{[^}]*object-fit:cover/);
 assert.match(css,/\.hn-moment-photo\{width:62px;height:62px/);
 assert.match(strip,/story\?\.photoUrl\|\|person.photoUrl/);
 assert.doesNotMatch(strip,/onOpenProfile|uploadMyProfilePhoto/);
});
test('Progress is visibly above the header, with a full-width track for each photo and a perceptible 3D turn',()=>{
 const css=read('apps/pwa/src/features/stories/stories.css');
 const viewer=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 assert.match(css,/\.hn-story-progress\{position:relative/);
 assert.match(css,/\.hn-story-progress-track\{flex:1;height:4px/);
 assert.match(css,/@keyframes hn-story-countdown/);
 assert.match(css,/rotateY\(-72deg\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(viewer,/STORY_PLAYBACK_MS\+'ms'/);
 assert.match(viewer,/onAnimationEnd=/);
 assert.match(viewer,/commentPaused/);
});
test('Public story conversation has its own 24h API, text, voice and hearts/claps; not Chat',()=>{
 const server=read('cloudflare/src/modules/stories/story-conversation.js');
 const mig=read('cloudflare/migrations/0032_story_conversation.sql');
 const api=read('packages/shared/src/story-conversation.ts');
 const pane=read('apps/pwa/src/features/stories/StoryConversationPanel.tsx');
 const recorder=read('apps/pwa/src/features/stories/StoryVoiceRecorder.tsx');
 const shower=read('apps/pwa/src/features/stories/StoryReactionShower.tsx');
 const storyWorker=read('cloudflare/src/modules/stories/stories.js');
 assert.match(server,/handleStoryConversation/);
 assert.match(server,/newVoiceGrant/);
 assert.match(server,/notifyFamilyClients/);
 assert.match(storyWorker,/handleStoryConversation\(/);
 assert.match(mig,/REFERENCES member_stories\(id\) ON DELETE CASCADE/);
 assert.match(api,/sendStoryText/);
 assert.match(api,/sendStoryVoice/);
 assert.match(api,/reactToStory/);
 assert.match(pane,/StoryVoiceRecorder/);
 assert.match(pane,/Todos pueden leer y responder/);
 assert.match(recorder,/MediaRecorder/);
 assert.match(shower,/makeChatReactionParticles/);
 for(const x of [server,api,pane,recorder,shower])
  assert.doesNotMatch(x,/openChatSocket|startNamedChatSession|saveLocalChat|chat_messages|new WebSocket/);
});
test('Expired states also queue and delete their audio, member removal queues voice files',()=>{
 const worker=read('cloudflare/src/modules/stories/stories.js');
 const admin=read('cloudflare/src/modules/admin/member-admin.js');
 assert.match(worker,/SELECT voice_key AS object_key/);
 assert.match(worker,/for\(const voice of voices\)await discardObject/);
 assert.match(admin,/FROM member_story_comments c/);
 assert.match(worker,/member_story_voice_grants WHERE expires_at/);
});
