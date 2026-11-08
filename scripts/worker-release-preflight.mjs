import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

// Runs exclusively on a Wrangler --dry-run bundle. Never deploys anything.
const bundlePath=process.argv[2];
assert.ok(bundlePath,'Usage: node scripts/worker-release-preflight.mjs /path/to/index.js');
const config=JSON.parse(readFileSync(new URL('../cloudflare/wrangler.jsonc',import.meta.url),'utf8'));
const bundle=readFileSync(bundlePath);
const code=bundle.toString('utf8');

assert.equal(config.name,'havana-nice-v2-dev','Canonical Worker name changed');
assert.equal(config.main,'./src/index.ts','Do not deploy from a patched compiled index.js');
assert.deepEqual(Object.keys(config.vars||{}).sort(),['HAVANA_ENV','V2_ADMIN_LOGIN_MODE'],
 'Unexpected Worker plain-text configuration bindings');
assert.equal(config.vars.V2_ADMIN_LOGIN_MODE,'enabled');
assert.equal(Object.hasOwn(config.vars,'V2_ADMIN_LOGIN_SECRET'),false,
 'Never commit Admin login credentials');
assert.deepEqual((config.d1_databases||[]).map(x=>x.binding),['DB']);
assert.deepEqual((config.r2_buckets||[]).map(x=>x.binding),['MEDIA_BUCKET']);
assert.deepEqual((config.durable_objects?.bindings||[]).map(x=>[x.name,x.class_name]).sort(),
 [['CALENDAR_ROOMS','CalendarRoom'],['CHAT_ROOMS','ChatRoom']],
 'Do not introduce a duplicate realtime Worker/DO');
assert.equal(config.services,undefined,'Do not revive a second-service bridge');
assert.equal((config.d1_databases||[]).length+
 (config.r2_buckets||[]).length+
 (config.durable_objects?.bindings||[]).length+
 Object.keys(config.vars||{}).length,6,
 'Expected six nonsecret bindings; the seventh is the Cloudflare Admin secret');
assert.ok(code.includes('/ws/family')&&code.includes('family.invalidate'),
 'Familia realtime must not be removed from the compiled release');
assert.ok(code.includes('MEDIA_BUCKET')&&code.includes('family_media_grants'),
 'Private media path must not be removed from the compiled release');

const release={
 status:'PREFLIGHT_ONLY_DO_NOT_DEPLOY',
 worker:config.name,
 sourceEntry:config.main,
 sha256:createHash('sha256').update(bundle).digest('hex'),
 sizeBytes:bundle.byteLength,
 sourceCommit:process.env.GITHUB_SHA||'local',
 expectedBindings:[
  'DB:d1','MEDIA_BUCKET:r2_bucket',
  'CALENDAR_ROOMS:durable_object_namespace',
  'CHAT_ROOMS:durable_object_namespace',
  'HAVANA_ENV:plain_text','V2_ADMIN_LOGIN_MODE:plain_text',
  'V2_ADMIN_LOGIN_SECRET:secret_text',
 ],
 oldLiveMustRemain:'v65@100% (81a512bb-a383-4258-8f5b-6aacf831b9b5) until staged release passes and rollback is verified',
};
console.log(JSON.stringify(release,null,2));
