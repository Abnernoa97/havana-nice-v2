import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleFamilyApi} from '../src/family.js';

const BASE='https://havana-nice-v2-dev.soloaplicaciones97.workers.dev';
const MEMBER='member:123e4567-e89b-42d3-a456-426614174001';
function db(){
 const raw=new DatabaseSync(':memory:');
 raw.exec('CREATE TABLE chat_members(actor_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,active INTEGER NOT NULL)');
 raw.prepare('INSERT INTO chat_members VALUES(?,?,?)').run(MEMBER,'Noa',1);
 raw.prepare('INSERT INTO chat_members VALUES(?,?,?)').run('member:123e4567-e89b-42d3-a456-426614174002','Fer',1);
 raw.prepare('INSERT INTO chat_members VALUES(?,?,?)').run('member:123e4567-e89b-42d3-a456-426614174003','Hidden',0);
 return {raw,prepare(sql){return {async all(){return {results:raw.prepare(sql).all()}}}}};
}
async function api(path,{token='',method='GET',admin=false,DB=db()}={}){
 const headers={Authorization:'Bearer '+token};
 const request=new Request(BASE+path,{method,headers});
 const response=await handleFamilyApi(request,{DB},new URL(request.url),'',
  (body,status=200)=>Response.json(body,{status}),
  async (_env,provided)=>provided==='member-token'?{actorId:MEMBER}:null);
 return {status:response.status,body:await response.json()};
}
// Admin auth uses the same server-only session gate and defaults to unauthorized
// in this isolated test (no admin D1 token or login secret is configured).
test('Familia refuses unauthenticated access and writes',async()=>{
 assert.equal((await api('/api/family/albums')).status,401);
 assert.equal((await api('/api/family/admin/albums')).status,401);
 assert.equal((await api('/api/family/albums',{method:'POST',token:'member-token'})).status,405);
});
test('Family albums derive only from active canonical roster without fabricated content',async()=>{
 const result=await api('/api/family/albums',{token:'member-token'});
 assert.equal(result.status,200);
 assert.equal(result.body.section,'Familia HAVANA NICE');
 assert.deepEqual(result.body.albums.map(x=>x.name),['Fer','Noa']);
 assert.ok(result.body.albums.every(x=>x.mediaReady===false&&x.photoCount===0&&
  x.videoCount===0&&x.coverUrl===null));
 assert.equal(Object.hasOwn(result.body,'book'),false); // BOOK is a UI module, not fabricated album metadata.
 assert.equal(result.body.mediaReady,false);
});
test('Unknown Family paths cannot disclose roster',async()=>{
 assert.equal((await api('/api/family/not-a-route',{token:'member-token'})).status,404);
});
