import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('APK creation occurs only through an explicitly approved batch marker',()=>{
 const yaml=read('../.github/workflows/v2-android-apk.yml');
 assert.match(yaml,/workflow_dispatch:/);
 assert.match(yaml,/push:\n\s+branches:\s*\[havana-nice-v2-foundation\]\n\s+paths:\n\s+- 'v2\/releases\/android-batch\.json'/);
 assert.doesNotMatch(yaml,/^\s+- 'v2\/apps\/android\/app\.json'/m);
 assert.doesNotMatch(yaml,/^\s+- '\.github\/workflows\/v2-android-apk\.yml'/m);
 assert.match(yaml,/m\.releaseMode!=='explicit-batch'/);
 assert.match(yaml,/m\.approved!==true/);
 assert.match(yaml,/m\.version!==app\.version/);
 assert.match(yaml,/m\.versionCode!==app\.android\.versionCode/);
 assert.match(yaml,/app\.android\.package!=='com\.havananice\.v2'/);
 assert.match(yaml,/m\.notes\.trim\(\)\.length<10/);
});

test('A future release marker is accepted only with explicit approval and matching version',()=>{
 const marker=new URL('../releases/android-batch.json',import.meta.url);
 if(!existsSync(marker))return; // No release requested: never build.
 const m=JSON.parse(read('releases/android-batch.json'));
 const app=JSON.parse(read('apps/android/app.json')).expo;
 assert.equal(m.approved,true);
 assert.equal(m.releaseMode,'explicit-batch');
 assert.equal(m.version,app.version);
 assert.equal(m.versionCode,app.android.versionCode);
 assert.equal(app.android.package,'com.havananice.v2');
 assert.ok(typeof m.notes==='string'&&m.notes.trim().length>=10);
});

test('Normal development CI validates Android code but does not assemble/publish APKs',()=>{
 const ci=read('../.github/workflows/v2-foundation-check.yml');
 assert.match(ci,/Export Android bundle/);
 assert.match(ci,/npm run export -w @havana\/android/);
 assert.doesNotMatch(ci,/assembleRelease|git worktree add|HAVANA-NICE-V2-LATEST\.apk/);
});
