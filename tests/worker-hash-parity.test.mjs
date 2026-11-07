import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {sha256Hex} from '../cloudflare/src/shared/crypto-helpers.js';

test('One canonical SHA-256 keeps the original D1 session/grant token hashes',async()=>{
  for(const value of [
    '',
    'havana-v2-worker-parity',
    'A_40_char_session_token________________________________',
    '🪇 Familia HAVANA NICE',
  ]){
    const expected=createHash('sha256').update(value,'utf8').digest('hex');
    const actual=await sha256Hex(value);
    assert.equal(actual,expected,'Hash migration is forbidden for existing tokens');
    assert.match(actual,/^[a-f0-9]{64}$/);
  }
});

test('Stable token hashing is independent of caller and uses no network/state',async()=>{
  const token='havana-v2-worker-parity';
  assert.equal(await sha256Hex(token),
    'b505991c232db5331301ae85871dc14e30c5d0828b9b7a2913139cbcc61883b5');
  assert.equal(await sha256Hex(token),await sha256Hex(token));
});