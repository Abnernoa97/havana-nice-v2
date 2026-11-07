import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cleanupMemberMedia,pendingMemberMedia} from '../src/shared/member-media-cleanup.js';

function fakeCleanup(){
 const actor='member:fer';
 const rows=[
  {object_key:'chat/member%3Afer/a',multipart_upload_id:null},
  {object_key:'chat/member%3Afer/b',multipart_upload_id:'multipart-b'},
  {object_key:'family/member%3Afer/c',multipart_upload_id:null},
 ];
 const pending=new Map(rows.map(x=>[x.object_key,x]));
 const failures=new Set(['family/member%3Afer/c']);
 const deleted=[],aborted=[];
 const DB={prepare(sql){
  return {bind(...args){
   return {
    async all(){
     assert.match(sql,/SELECT object_key,multipart_upload_id FROM r2_member_delete_queue/);
     return {results:[...pending.values()].slice(0,args[1])};
    },
    async first(){
     assert.match(sql,/SELECT COUNT\(\*\) AS remaining FROM r2_member_delete_queue/);
     return {remaining:pending.size};
    },
    async run(){
     assert.match(sql,/DELETE FROM r2_member_delete_queue/);
     pending.delete(args[1]);
     return {meta:{changes:1}};
    },
   };
  }};
 }};
 const MEDIA_BUCKET={
  async delete(key){
   deleted.push(key);
   if(failures.has(key))throw new Error('Temporary R2 outage');
  },
  resumeMultipartUpload(key,id){
   return {async abort(){aborted.push([key,id]);}};
  },
 };
 return {actor,DB,MEDIA_BUCKET,failures,deleted,aborted,pending};
}

test('R2 deletion queue survives failures and retries without data loss',async()=>{
 const env=fakeCleanup();
 const first=await cleanupMemberMedia(env,env.actor);
 assert.deepEqual(first,{cleaned:2,pending:1});
 assert.equal(env.pending.has('family/member%3Afer/c'),true,'failed item stays accounted for');
 assert.deepEqual(env.aborted,[['chat/member%3Afer/b','multipart-b']]);
 assert.equal(await pendingMemberMedia(env,env.actor),1);
 env.failures.clear();
 const second=await cleanupMemberMedia(env,env.actor);
 assert.deepEqual(second,{cleaned:1,pending:0});
 assert.equal(env.pending.size,0);
});

test('missing R2 binding never marks queued private files as deleted',async()=>{
 const env=fakeCleanup();
 delete env.MEDIA_BUCKET;
 assert.deepEqual(await cleanupMemberMedia(env,env.actor),{cleaned:0,pending:null});
 assert.equal(env.pending.size,3);
});

test('missing multipart upload is idempotent and safe to mark as cleaned',async()=>{
 const env=fakeCleanup();
 env.pending.clear();
 env.pending.set('chat/member%3Afer/missing',{object_key:'chat/member%3Afer/missing',multipart_upload_id:'old'});
 env.MEDIA_BUCKET.resumeMultipartUpload=()=>({abort:async()=>{const err=new Error('NoSuchUpload');err.status=404;throw err;}});
 assert.deepEqual(await cleanupMemberMedia(env,env.actor),{cleaned:1,pending:0});
});

test('the live 9.5GB R2 budget counts queued bytes until deletion is confirmed',()=>{
 const q=readFileSync(new URL('../src/modules/family/family-quota.js',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../migrations/0026_member_delete_media_cleanup.sql',import.meta.url),'utf8');
 const worker=readFileSync(new URL('../src/modules/admin/member-admin.js',import.meta.url),'utf8');
 assert.match(q,/SELECT COALESCE\(SUM\(size_bytes\),0\) FROM r2_member_delete_queue/);
 assert.match(migration,/object_key TEXT PRIMARY KEY NOT NULL/);
 assert.match(migration,/actor_id TEXT NOT NULL/);
 assert.match(worker,/DELETE FROM chat_media_objects WHERE sender_id=\?/);
 assert.match(worker,/DELETE FROM family_media WHERE actor_id=\?/);
 assert.match(worker,/DELETE FROM family_upload_sessions WHERE actor_id=\?/);
 assert.match(worker,/await env\.DB\.batch\(queries\)/);
 assert.match(worker,/cleanupPending:cleanup\.pending/);
});
