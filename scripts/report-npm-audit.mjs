import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

// Audits are read-only; never call audit fix or mutate pinned Expo dependencies.
// Exit code 1 from npm audit means it found vulnerabilities, not that the
// diagnostic failed. A real registry failure is handled by the workflow.
export function classifyAudit(report){
 const vulnerabilities=report?.vulnerabilities;
 if(!vulnerabilities||typeof vulnerabilities!=='object'||Array.isArray(vulnerabilities))
  throw new Error('npm audit returned no valid vulnerabilities object');
 return Object.entries(vulnerabilities).map(([name,value])=>{
  const via=Array.isArray(value.via)?value.via:[];
  const advisories=via.filter(x=>x&&typeof x==='object').map(x=>({
   title:x.title||'Unnamed advisory',severity:x.severity||value.severity,
   range:x.range||'',url:x.url||''
  }));
  const inherited=via.filter(x=>typeof x==='string');
  return {name,severity:value.severity||'unknown',
   direct:!!value.isDirect,range:value.range||'',
   fix:value.fixAvailable===false?'none':
    value.fixAvailable===true?'compatible-or-unbounded':
    value.fixAvailable&&typeof value.fixAvailable==='object'
      ?`${value.fixAvailable.name}@${value.fixAvailable.version}${value.fixAvailable.isSemVerMajor?' (major)':''}`
      :'unknown',
   advisories,inherited};
 }).sort((a,b)=>{
  const rank={critical:0,high:1,moderate:2,low:3};
  return (rank[a.severity]??4)-(rank[b.severity]??4)||a.name.localeCompare(b.name);
 });
}
export function printAudit(report){
 const items=classifyAudit(report);
 const counts=report.metadata?.vulnerabilities||{};
 console.log('NPM V2 risk summary:',JSON.stringify(counts));
 for(const item of items){
  console.log(JSON.stringify(item));
 }
 console.log('Advisory package count:',items.length);
 return items;
}
const entry=process.argv[1]&&resolve(process.argv[1]);
if(entry===new URL(import.meta.url).pathname){
 try{printAudit(JSON.parse(readFileSync(process.argv[2],'utf8')));}
 catch(e){console.error('Audit classification error:',e);process.exitCode=2;}
}
