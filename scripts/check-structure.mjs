import { existsSync, readFileSync } from 'node:fs';

const required = [
  'apps/android/App.tsx',
  'apps/android/app.json',
  'apps/pwa/src/app/App.tsx',
  'apps/pwa/public/manifest.webmanifest',
  'packages/shared/src/index.ts',
  'cloudflare/src/index.ts',
  'cloudflare/wrangler.jsonc',
  'cloudflare/package.json',
  'cloudflare/migrations/0001_foundation.sql',
  'docs/PLAN-MAESTRO.md',
];

const missing = required.filter((path) =>
  !existsSync(new URL(`../${path}`, import.meta.url)),
);

if (missing.length) {
  console.error('Missing V2 foundation files:', missing);
  process.exit(1);
}

for (const path of [
  'package.json',
  'apps/android/package.json',
  'apps/pwa/package.json',
  'cloudflare/package.json',
]) {
  JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
}

JSON.parse(
  readFileSync(new URL('../cloudflare/wrangler.jsonc', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, ''),
);

// Enforce the layered architecture of the standalone V2 repository.
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir=fileURLToPath(new URL('../',import.meta.url));
const children=folder=>readdirSync(join(rootDir,folder)).sort();
assert.deepEqual(children('apps/pwa/src'),
 ['app','features','services','styles','vite-env.d.ts'],
 'PWA source root cannot grow parallel or legacy implementations');
assert.deepEqual(children('apps/android'),
 ['App.tsx','app.json','features','package.json','services','tsconfig.json'],
 'Android must keep one Expo entry and grouped modules');
assert.deepEqual(children('cloudflare/src'),
 ['index.ts','modules','shared'],
 'The Worker must keep a single typed entry point');

for(const name of ['calendar','chat','family','repertoire'])
 assert.ok(existsSync(join(rootDir,'apps/pwa/src/features',name)),
  'Missing PWA feature: '+name);
for(const name of ['calendar','chat','family','home','repertoire'])
 assert.ok(existsSync(join(rootDir,'apps/android/features',name)),
  'Missing native feature: '+name);
for(const name of ['admin','calendar','chat','family','repertoire'])
 assert.ok(existsSync(join(rootDir,'cloudflare/src/modules',name)),
  'Missing Worker domain: '+name);

// Verify all relative imports resolve and reject source modules with no active
// path from a PWA, Android or Worker entry point.
const sourceRoots=['apps/pwa/src','apps/android','cloudflare/src'];
const extensions=new Set(['.ts','.tsx','.js','.css']);
function collect(folder){
 const result=[];
 for(const name of readdirSync(join(rootDir,folder))){
  const path=folder+'/'+name;
  if(statSync(join(rootDir,path)).isDirectory())result.push(...collect(path));
  else if(extensions.has(extname(path))&&!path.endsWith('.d.ts'))result.push(path);
 }
 return result;
}
const sources=sourceRoots.flatMap(collect).sort();
const sourceSet=new Set(sources);
const imports=new Map(sources.map(s=>[s,[]]));
for(const path of sources){
 if(path.endsWith('.css'))continue;
 const code=readFileSync(join(rootDir,path),'utf8');
 // Dynamic import() is a *reachable lazy edge*, not dead source. The graph
 // must validate both eager and on-demand feature modules without treating
 // a deliberate chunk boundary as an orphaned implementation.
 const pattern=/\bfrom\s+['"](\.[^'"]+)['"]|\bimport\s+['"](\.[^'"]+)['"]|\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
 for(const match of code.matchAll(pattern)){
  const local=match[1]||match[2]||match[3];
  const absolute=resolve(rootDir,dirname(path),local);
  const candidates=[absolute,absolute+'.ts',absolute+'.tsx',absolute+'.js',
   absolute+'.css',join(absolute,'index.ts'),join(absolute,'index.tsx')];
  const target=candidates.find(p=>existsSync(p)&&statSync(p).isFile());
  assert.ok(target,'Broken local import '+path+' -> '+local);
  const rel=relative(rootDir,target).replaceAll('\\','/');
  assert.ok(!rel.startsWith('../'),'Unapproved cross-repository import: '+path);
  if(sourceSet.has(rel))imports.get(path).push(rel);
 }
}
const entrypoints=[
 'apps/pwa/src/app/main.tsx','apps/pwa/src/app/admin-main.tsx',
 'apps/pwa/src/app/visual-main.tsx','apps/pwa/src/app/native-book-main.tsx',
 'apps/android/App.tsx','cloudflare/src/index.ts'
];
const seen=new Set(),queue=[...entrypoints];
while(queue.length){
 const current=queue.shift();
 if(seen.has(current))continue;
 assert.ok(sourceSet.has(current),'Missing V2 entry '+current);
 seen.add(current);
 queue.push(...(imports.get(current)||[]));
}
const dormant=sources.filter(path=>!seen.has(path));
assert.deepEqual(dormant,[],'Unused source files remain outside the live import graph');
console.log('HAVANA NICE V2 architecture and reachable import graph: OK');

console.log('HAVANA NICE V2 foundation structure: OK');
