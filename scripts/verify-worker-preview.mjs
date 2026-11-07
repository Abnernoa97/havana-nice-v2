import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Inspect the reproducible Wrangler dry-run bundle, never the live Worker.
const file=process.argv[2];
assert.ok(file,'Pass the canonical Wrangler dry-run Worker index.js path');
const source=readFileSync(file,'utf8');

const mustAppear=[
  ['private Familia WebSocket','/ws/family'],
  ['single ChatRoom invalidation route','/family-invalidate'],
  ['notification payload','family.invalidate'],
  ['subscription acknowledgement','family.ready'],
  ['authenticated member roster','FROM chat_members WHERE active=1'],
  ['private media grant','/api/family/media/'],
  ['authenticated album management','/api/family/admin/albums'],
  ['private R2 object storage','MEDIA_BUCKET'],
  ['existing ChatRoom Durable Object','var ChatRoom = class'],
  ['existing CalendarRoom Durable Object','var CalendarRoom = class'],
  ['multipart completion','function completeFamilyMultipart('],
  ['cover selection','function selectFamilyCover('],
  ['media deletion','function deleteFamilyMedia('],
  ['storage budget','function familyStorageUsage('],
  ['one shared hashing primitive','function sha256Hex('],
];
for(const [name,pattern] of mustAppear)
  assert.ok(source.includes(pattern),'Compiled Worker lost '+name);

for(const [name,re] of [
  ['periodic gallery polling',/setInterval\s*\(/],
  ['previous Google Drive media bridge',/googleapis\.com|www\.googleapis\.com/],
  ['previous Supabase bridge',/supabase\.co/],
  ['legacy alternative token hashes',/\b(?:async )?function\s+(?:hash2?|hash3|digest|sha256)\s*\(/],
])assert.doesNotMatch(source,re,'Compiled Worker contains '+name);

assert.equal((source.match(/\bfunction sha256Hex\s*\(/g)||[]).length,1,
  'Compiled Worker must contain one and only one shared SHA-256 helper');
assert.equal((source.match(/\bvar ChatRoom = class\b/g)||[]).length,1,
  'Compiled Worker must contain exactly one canonical ChatRoom class');
assert.equal((source.match(/\bvar CalendarRoom = class\b/g)||[]).length,1,
  'Compiled Worker must contain exactly one canonical CalendarRoom class');

const hash=createHash('sha256').update(readFileSync(file)).digest('hex');
console.log(JSON.stringify({result:'PASS',source:'Wrangler dry-run',
  bytes:Buffer.byteLength(source),sha256:hash,privateMedia:'preserved',
  familyRealtime:'preserved',duplicateHashImplementations:0}));
