import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 makeChatReactionParticles,CHAT_REACTION_BURST_HOLD_MS,
 CHAT_REACTION_BURST_TICK_MS,CHAT_REACTION_BURST_PER_TICK,CHAT_REACTION_BURST_MAX_PARTICLES,
} from '../packages/shared/src/chat-reaction-burst.ts';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Emoji showers use one bounded shared policy for PWA, Android and iPadOS',()=>{
 assert.ok(CHAT_REACTION_BURST_HOLD_MS>=300);
 assert.ok(CHAT_REACTION_BURST_TICK_MS>=100);
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

test('Only held reaction icon emits visual-only particles; tap persists once and gestures remain',()=>{
 const pwa=read('apps/pwa/src/features/chat/PwaChatMessageMenu.tsx');
 const native=read('apps/android/features/chat/NativeChatMessageMenu.tsx');
 const css=read('apps/pwa/src/styles/chat/chat.css');
 assert.match(pwa,/onPointerDown=\{event=>beginHold\(emoji,event\)\}/);
 assert.match(pwa,/onPointerUp=\{stopBurst\}/);
 assert.match(pwa,/onPointerCancel=\{stopBurst\}/);
 assert.match(pwa,/onLostPointerCapture=\{stopBurst\}/);
 assert.match(pwa,/if\(holdConsumed\.current\)/);
 assert.match(native,/delayLongPress=\{CHAT_REACTION_BURST_HOLD_MS\}/);
 assert.match(native,/onLongPress=\{event=>beginBurst\(emoji,/);
 assert.match(native,/onPressOut=\{stopBurst\}/);
 assert.match(native,/useNativeDriver:true/);
 assert.match(native,/if\(pressConsumed\.current\)/);
 for(const src of [pwa,native]){
   assert.ok(src.includes("['👍','❤️','😂']"));
   assert.match(src,/onReact\(message,emoji\)/);
   assert.match(src,/CHAT_REACTION_BURST_MAX_PARTICLES/);
   assert.doesNotMatch(src,/new WebSocket|fetch\(|uploadChat|chatReactionPayload|localStorage|AsyncStorage/);
 }
 assert.match(css,/\.chat-reaction-shower\{position:fixed;inset:0;z-index:1;pointer-events:none;/);
 assert.match(css,/@keyframes hn-reaction-float/);
 assert.match(read('apps/pwa/src/features/chat/SwipeMessage.tsx'),/onSwipeRight\(\)/);
 assert.match(read('apps/android/features/chat/SwipeableBubble.tsx'),/callbacks\.current\.onReply\(\)/);
});
