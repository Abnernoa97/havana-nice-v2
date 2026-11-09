import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyAudit} from '../scripts/report-npm-audit.mjs';

test('npm audit summaries distinguish direct and transitive, with correct majors',()=>{
 const rows=classifyAudit({vulnerabilities:{
  'z-transitive':{isDirect:false,severity:'moderate',range:'<2',fixAvailable:false,via:['parent']},
  'a-direct':{isDirect:true,severity:'high',range:'<5',
   fixAvailable:{name:'a-direct',version:'5.0.0',isSemVerMajor:true},
   via:[{title:'Unsafe parser',severity:'high',range:'<5',url:'https://example.test/advisory'}]}
 }});
 assert.deepEqual(rows.map(x=>x.name),['a-direct','z-transitive']);
 assert.equal(rows[0].direct,true);
 assert.equal(rows[0].fix,'a-direct@5.0.0 (major)');
 assert.equal(rows[0].advisories[0].title,'Unsafe parser');
 assert.equal(rows[1].direct,false);
 assert.deepEqual(rows[1].inherited,['parent']);
 assert.equal(rows[1].fix,'none');
});
test('malformed audit output cannot be silently accepted',()=>{
 assert.throws(()=>classifyAudit({error:'registry unavailable'}));
});
