import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('apps/pwa/src/features/shared/PrivateThumbnail.tsx');
const script=ts.transpileModule(source,{fileName:'PrivateThumbnail.tsx',
 compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;

test('a cold iPhone image is rendered synchronously; IndexedDB never gates first frame',()=>{
 const effects=[],state=[];
 const exports={};
 const React={
  useState:init=>[init,()=>{}],useRef:init=>({current:init}),
  useEffect:fn=>effects.push(fn),
 };
 const jsx=(type,props)=>({type,props});
 runInNewContext(script,{exports,require(id){
  if(id==='react')return React;
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};
  if(id==='../../services/private-image-cache')return {
   readPrivateImage:async()=>null,storePrivateImage:async()=>{},
  };
  throw Error('Unexpected dependency '+id);
 }});
 const html=exports.default({token:'fer-session',cacheKey:'family-thumb:123',
  src:'https://worker.example/api/family/media/authorized',alt:'',loading:'eager'});
 assert.equal(html.type,'img');
 assert.equal(html.props.src,'https://worker.example/api/family/media/authorized');
 assert.equal(effects.length,1,'background cache lookup is scheduled, not awaited during render');
 assert.ok(!source.includes('if(!shown?.url)return'),'no blank initial frame while awaiting IDB');
});
test('thumbnail grant rotation never revokes the decoded JPEG on src changes',()=>{
 assert.match(source,/\},\[identity\]\)/);
 assert.doesNotMatch(source,/\},\[token,cacheKey,src,identity\]\)/);
 assert.match(source,/if\(blobUrl\)URL\.revokeObjectURL\(blobUrl\)/);
 assert.match(source,/if\(local\)\{setRejected\(identity\);return;\}/);
});
test('Safari image reductions are strictly background work, one-at-a-time',()=>{
 assert.match(source,/if\(working\)return/);
 assert.match(source,/window\.requestIdleCallback/);
 assert.match(source,/const blob=await new Promise<Blob\|null>/);
 assert.match(source,/ctx\.drawImage\(job\.image/);
 assert.match(source,/if\(!job\.cancelled&&blob\)/);
 assert.doesNotMatch(source,/onLoad=\{persist\}|useEffect\(\(\)=>\{.*canvas/);
 const audio=read('apps/pwa/src/features/audio/MemberAudio.tsx');
 assert.doesNotMatch(audio,/setPreparedCovers|prepareAudioCover/);
 assert.match(audio,/PrivateThumbnail token=\{token\} cacheKey=\{"audio-cover:"\+current\.id\}/);
});
