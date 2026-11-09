import test from 'node:test';
import assert from 'node:assert/strict';
import {
 CHAT_PREVIEW_LONG_EDGE,CHAT_PREVIEW_JPEG_QUALITY,CHAT_PREVIEW_MAX_ACTIVE,
 chatPreviewSize,
} from '../apps/pwa/src/features/chat/chat-photo-preview.ts';

test('High-density photo preview retains sharp pixel dimensions',()=>{
 assert.equal(CHAT_PREVIEW_LONG_EDGE,1440);
 assert.equal(CHAT_PREVIEW_JPEG_QUALITY,.92);
 assert.equal(CHAT_PREVIEW_MAX_ACTIVE,2);
 assert.deepEqual(chatPreviewSize(4032,3024),{width:1440,height:1080});
 assert.deepEqual(chatPreviewSize(3024,4032),{width:1080,height:1440});
 assert.deepEqual(chatPreviewSize(800,600),{width:800,height:600});
 assert.deepEqual(chatPreviewSize(1,1),{width:1,height:1});
});

test('The preview policy never enlarges the original and preserves aspect ratio',()=>{
 for(const [w,h] of [[120,800],[3840,2160],[3000,4000],[96,96],[500,100]]){
   const scaled=chatPreviewSize(w,h);
   assert.ok(scaled.width<=w&&scaled.height<=h);
   assert.ok(Math.max(scaled.width,scaled.height)<=CHAT_PREVIEW_LONG_EDGE);
   assert.ok(Math.abs(scaled.width/scaled.height-w/h)<0.018);
 }
});
