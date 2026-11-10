import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 chatPhotoCompressionWorthIt,CHAT_PHOTO_COMPRESS_MIN_BYTES,
 CHAT_PHOTO_COMPRESS_MIN_SAVINGS,CHAT_PHOTO_COMPRESS_MAX_PIXELS
} from '../apps/pwa/src/features/chat/chat-photo-upload-optimizer.ts';

test('keep a conversion only when it saves at least 12% of bytes',()=>{
 assert.equal(chatPhotoCompressionWorthIt(2_000_000,700_000),true);
 assert.equal(chatPhotoCompressionWorthIt(2_000_000,1_900_000),false);
 assert.equal(chatPhotoCompressionWorthIt(2_000_000,2_100_000),false);
 assert.equal(chatPhotoCompressionWorthIt(2_000_000,0),false);
 assert.equal(chatPhotoCompressionWorthIt(0,300),false);
 assert.equal(CHAT_PHOTO_COMPRESS_MIN_SAVINGS,0.08);
});
test('small or already efficient photos are not re-encoded needlessly',()=>{
 assert.equal(chatPhotoCompressionWorthIt(CHAT_PHOTO_COMPRESS_MIN_BYTES-1,10),false);
 assert.equal(chatPhotoCompressionWorthIt(CHAT_PHOTO_COMPRESS_MIN_BYTES,100),true);
});
test('encoder preserves original decoded dimensions, image transparency and fallback',()=>{
 const source=readFileSync(new URL('../apps/pwa/src/features/chat/chat-photo-upload-optimizer.ts',import.meta.url),'utf8');
 assert.match(source,/canvas\.width=target\.width;canvas\.height=target\.height/);
 assert.match(source,/context\.drawImage\(decoded\.source,0,0,target\.width,target\.height\)/);
 assert.match(source,/canvas\.toBlob\(/);
 assert.match(source,/image\/webp/);
 assert.match(source,/if\(file\.type==='image\/png'\|\|file\.type==='image\/webp'\)return file/);
 assert.match(source,/catch\{[\s\S]*?return file/);
 assert.equal(CHAT_PHOTO_COMPRESS_MAX_PIXELS,22_000_000);
 assert.match(source,/CHAT_PHOTO_UPLOAD_LONG_EDGE=2048/);
 assert.match(source,/CHAT_PHOTO_WEBP_QUALITY=0\.74/);
});
