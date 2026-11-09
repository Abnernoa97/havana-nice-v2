import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 makeChatReactionParticles,CHAT_REACTION_BURST_WAVES,
 CHAT_REACTION_BURST_WAVE_GAP_MS,CHAT_REACTION_BURST_PER_TICK,CHAT_REACTION_BURST_MAX_PARTICLES,
} from '../packages/shared/src/chat-reaction-burst.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Emoji showers use one bounded shared policy for PWA, Android and iPadOS',()=>{
 assert.equal(CHAT_REACTION_BURST_WAVES,9);
 assert.ok(CHAT_REACTION_BURST_WAVE_GAP_MS>=80);
 assert.equal(CHAT_REACTION_BURST_PER_TICK,3);
 assert.ok(CHAT_REACTION_BURST_MAX_PARTICLES<=50);
 const viewport={width:390,height:840};
 const particles=makeChatReactionParticles('❤️',{x:190,y:320},viewport,30,()=>.5);
 assert.equal(particles.length,3);
 assert.deepEqual(particles.map(p=>p.id),[30,31,32]);
 for(const particle of particles){
   assert.equal(particle.emoji,'❤️');
   assert.ok(particle.x>=16&&particle.x<=viewport.width-16);
   assert.ok(particle.y>=26&&particle.y<=viewport.height-26);
   assert.ok(particle.dy<0);
   assert.ok(particle.duration>=1500&&particle.duration<=2150);
   assert.ok(particle.size>=25&&particle.size<=44);
 }
});

test('Particle motion clamps extreme points and random values on tablet and phone',()=>{
 for(const viewport of [{width:1024,height:1366},{width:320,height:568}]){
   for(const random of [()=>-5,()=>5]){
     const particles=makeChatReactionParticles('😂',{x:2000,y:-500},
       viewport,0,random);
     assert.equal(particles.length,CHAT_REACTION_BURST_PER_TICK);
     for(const p of particles){
       assert.ok(p.x>=16&&p.x<=viewport.width-16);
       assert.ok(p.y>=26&&p.y<=viewport.height-26);
     }
   }
 }
});

test('Single tap emits a finite emoji shower and only one saved reaction',()=>{
 const pwa=read('apps/pwa/src/features/chat/PwaChatMessageMenu.tsx');
 const native=read('apps/android/features/chat/NativeChatMessageMenu.tsx');
 const shower=read('apps/android/features/chat/NativeChatReactionShower.tsx');
 const app=read('apps/android/app/NativeApp.tsx');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 assert.match(pwa,/onClick=\{event=>\{/);
 assert.match(pwa,/startShower\(emoji,/);
 assert.match(pwa,/onReact\(message,emoji\)/);
 assert.doesNotMatch(pwa,/onPointerDown|onLongPress|holdTimer/);
 assert.match(pwa,/\{message&&<div className="message-menu-overlay"/);
 assert.match(native,/onPress=\{event=>onReact\(message,emoji,/);
 assert.doesNotMatch(native,/delayLongPress|onLongPress|onPressIn/);
 assert.match(app,/setReactionBurst\(\{id:\+\+reactionBurstId.current,emoji,\.\.\.origin\}\)/);
 assert.match(app,/<NativeChatReactionShower burst=\{reactionBurst\}/);
 assert.match(shower,/useNativeDriver:true/);
 assert.match(shower,/CHAT_REACTION_BURST_WAVES/);
 assert.match(shower,/pointerEvents="none"/);
 for(const src of [pwa,native,shower]){
   assert.ok(src.includes("['👍','❤️','😂']")||src.includes('makeChatReactionParticles'));
   assert.doesNotMatch(src,/new WebSocket|fetch\(|uploadChat|chatReactionPayload|localStorage|AsyncStorage/);
 }
 assert.match(css,/\.chat-reaction-shower\{position:fixed;inset:0;z-index:1002;pointer-events:none;/);
 assert.match(css,/@keyframes hn-reaction-float/);
 assert.match(read('apps/pwa/src/features/chat/SwipeMessage.tsx'),/onSwipeRight\(\)/);
 assert.match(read('apps/android/features/chat/SwipeableBubble.tsx'),/callbacks\.current\.onReply\(\)/);
});

test('Composers grow with draft text but cap height and preserve action controls',()=>{
 const pwa=read('apps/pwa/src/app/App.tsx');
 const native=read('apps/android/app/NativeApp.tsx');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 const styles=read('apps/android/styles/chat-styles.ts');
 assert.match(pwa,/<textarea aria-label="Escribir mensaje" ref=\{draftInput\}/);
 assert.match(pwa,/field\.scrollHeight/);
 assert.match(pwa,/Math\.min\(132,Math\.max\(46,field\.scrollHeight\)\)/);
 assert.match(native,/onContentSizeChange=\{event=>\{/);
 assert.match(native,/Math\.max\(42,Math\.min\(132,measured\)\)/);
 assert.match(native,/scrollEnabled=\{draftFieldHeight>=132\}/);
 assert.match(css,/\.chat-composer \.chat-input-pill textarea\{/);
 assert.match(styles,/inputPill:\{flex:1,minWidth:0,minHeight:50,maxHeight:142/);
 for(const src of [pwa,native]){
   assert.match(src,/maxLength=\{2000\}/);
   assert.match(src,/selectedMedia\.length/);
 }
});
