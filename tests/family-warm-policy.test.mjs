import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const src=read('apps/pwa/src/features/family/family-warm-policy.ts');
const compiled=ts.transpileModule(src,{fileName:'family-warm-policy.ts',
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const policy={};
runInNewContext(compiled,{exports:policy});

test('Familia prewarm does not saturate slow networks or devices using Data Saver',()=>{
 assert.equal(policy.familyBackgroundWarmBudget(),2);
 assert.equal(policy.familyBackgroundWarmBudget({effectiveType:'4g'}),2);
 assert.equal(policy.familyBackgroundWarmBudget({effectiveType:'3g'}),1);
 assert.equal(policy.familyBackgroundWarmBudget({effectiveType:'slow-2g'}),0);
 assert.equal(policy.familyBackgroundWarmBudget({effectiveType:'2g'}),0);
 assert.equal(policy.familyBackgroundWarmBudget({saveData:true,effectiveType:'4g'}),0);
 assert.equal(policy.FAMILY_BACKGROUND_THUMBNAIL_LIMIT,3);
});
test('only above-the-fold Family album covers request eager decoding',()=>{
 assert.equal(policy.FAMILY_EAGER_COVER_LIMIT,4);
 for(let index=0;index<28;index++)
  assert.equal(policy.familyCoverLoadPriority(index),index<4?'eager':'lazy');
});
test('the currently opened private album outranks speculative prefetch',()=>{
 const member=read('apps/pwa/src/features/family/MemberFamily.tsx');
 assert.match(member,/if\(!directory\?\.mediaReady\|\|selected\|\|document\.hidden\)return/);
 assert.match(member,/directory\.albums\.slice\(0,familyBackgroundWarmBudget\(connection\)\)/);
 assert.doesNotMatch(member,/warmThumbnails|predecoded|new Image\(/);
 assert.match(member,/className="hn-family-cover-photo" src=\{cover\}/);
 // Only metadata preloads in the background; visible JPEGs load directly.
 assert.match(member,/loading=\{familyCoverLoadPriority\(index\)\}/);
 assert.match(member,/itemsActor===selected/);
 assert.match(member,/cacheEpoch\.current===epoch/);
 assert.doesNotMatch(member,/localStorage\.|indexedDB\.open\(|caches\.open\(|new WebSocket\(/);
});
