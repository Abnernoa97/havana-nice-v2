import test from 'node:test';
import assert from 'node:assert/strict';
import {
 peekChatPhotoPreview,rememberChatPhotoPreview,
 CHAT_PREVIEW_MEMORY_LIMIT_BYTES,CHAT_PREVIEW_DISK_LIMIT_BYTES,
 CHAT_PREVIEW_DISK_MAX_ITEMS,CHAT_PREVIEW_TTL_MS,
} from '../apps/pwa/src/features/chat/chat-photo-thumbnail-cache.ts';

const photo=(assetId='photo-1',sizeBytes=4500000)=>({assetId,sizeBytes});
test('preview appears from memory without authorizing or fetching original again',()=>{
 const media=photo(),thumbnail=new Blob(['optimized thumbnail'],{type:'image/jpeg'});
 assert.equal(peekChatPhotoPreview('session-a',media),null);
 rememberChatPhotoPreview('session-a',media,thumbnail);
 assert.equal(peekChatPhotoPreview('session-a',media),thumbnail);
 assert.equal(peekChatPhotoPreview('session-b',media),null,'never mix two authorized members');
 assert.equal(peekChatPhotoPreview('session-a',photo('photo-1',4500001)),null);
});
test('memory cache evicts least-recently-used preview under a strict byte budget',()=>{
 const blobA=new Blob([new Uint8Array(6*1024*1024)],{type:'image/jpeg'});
 const blobB=new Blob([new Uint8Array(6*1024*1024)],{type:'image/jpeg'});
 const blobC=new Blob([new Uint8Array(6*1024*1024)],{type:'image/jpeg'});
 const a=photo('a'),b=photo('b'),c=photo('c');
 rememberChatPhotoPreview('memory-test',a,blobA);
 rememberChatPhotoPreview('memory-test',b,blobB);
 assert.equal(peekChatPhotoPreview('memory-test',a),blobA,'recently viewed photo becomes newest');
 rememberChatPhotoPreview('memory-test',c,blobC);
 assert.equal(peekChatPhotoPreview('memory-test',a),blobA);
 assert.equal(peekChatPhotoPreview('memory-test',b),null,'oldest thumbnail evicted');
 assert.equal(peekChatPhotoPreview('memory-test',c),blobC);
 assert.equal(CHAT_PREVIEW_MEMORY_LIMIT_BYTES,16*1024*1024);
});
test('disk cache has bounded lifetime and storage, never saves full original',()=>{
 assert.equal(CHAT_PREVIEW_DISK_LIMIT_BYTES,48*1024*1024);
 assert.equal(CHAT_PREVIEW_DISK_MAX_ITEMS,80);
 assert.equal(CHAT_PREVIEW_TTL_MS,14*24*60*60*1000);
 const huge=new Blob([new Uint8Array(9*1024*1024)]);
 rememberChatPhotoPreview('memory-test',photo('oversized'),huge);
 assert.equal(peekChatPhotoPreview('memory-test',photo('oversized')),null);
});
