import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('the iPhone state paints the signed JPEG in the first frame just like Android 0.0.30',()=>{
 const source=read('apps/pwa/src/features/stories/StoryPhotoSurface.tsx');
 const compiled=ts.transpileModule(source,{fileName:'StoryPhotoSurface.tsx',
  compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
 }).outputText;
 const exports={};
 const jsx=(type,props)=>({type,props});
 runInNewContext(compiled,{exports,require(name){
  if(name==='react')return {memo:fn=>fn};
  if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  throw Error('unexpected dependency');
 }});
 const ready=[];
 const tree=exports.default({id:'one',name:'Fer',url:'https://api.example/photo/grant',
  failed:false,loaded:false,onReady:(...a)=>ready.push(a),onError:()=>{}});
 const branch=tree.props.children;
 const children=branch?.type==='fragment'?branch.props.children:branch;
 const img=Array.isArray(children)?children.find(x=>x?.type==='img'):null;
 assert.equal(img?.props.src,'https://api.example/photo/grant');
 assert.equal(img?.props.loading,'eager');
 img.props.onLoad();
 assert.equal(ready.length,1);
 assert.equal(ready[0][0],'one');
 assert.match(source,/onError=\{\(\)=>onError\(id,url\)\}/);
 assert.doesNotMatch(source,/fetch\(|\.decode\(|URL\.createObjectURL/);
});
test('iPhone story photo source is pinned during reactions and moves only on state/grant change',()=>{
 const controller=read('apps/pwa/src/features/stories/useStoryPhotoCache.ts');
 assert.match(controller,/getWarmStoryPhoto\(current\)\|\|current\.photoUrl/);
 assert.match(controller,/pinned\.current\.grant!==current\.photoUrl/);
 assert.match(controller,/const next=items\[position\+1\]/);
 assert.doesNotMatch(controller,/fetch\(|response\.blob\(\)/);
 const viewer=read('apps/pwa/src/features/stories/MemberStoryViewer.tsx');
 assert.match(viewer,/const isReady=loadedKey===sourceKey/);
 assert.match(viewer,/const paused=.*\(!isReady&&!failedPhoto\)/);
});
test('Family JPEGs are visible without IndexedDB or duplicate precoders',()=>{
 const family=read('apps/pwa/src/features/family/MemberFamily.tsx');
 const gallery=read('apps/pwa/src/features/family/FamilyMediaGallery.tsx');
 assert.match(family,/className="hn-family-album-photo" src=\{cover\}/);
 assert.match(family,/className="hn-family-cover-photo" src=\{cover\}/);
 assert.match(gallery,/<img src=\{item\.thumbnail\}/);
 assert.doesNotMatch(family+gallery,/new Image\(|PrivateThumbnail|readPrivateImage|setPreparedCovers/);
});
test('Chat MOV and MP4 use Safari native video controls instead of custom JS play()',()=>{
 const gallery=read('apps/pwa/src/features/chat/ChatMediaGallery.tsx');
 assert.match(gallery,/<video key=\{url\} src=\{url\} preload="metadata" playsInline controls/);
 assert.doesNotMatch(gallery,/controls=\{false\}|video\.current\.play\(\)/);
 assert.match(gallery,/closest\?\.\('input,video'\)/);
 const server=read('cloudflare/src/modules/chat/chat-media.js');
 assert.match(server,/accept-ranges/);
 assert.match(server,/content-range/);
});
