import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>JSON.parse(readFileSync(new URL('../'+path,import.meta.url),'utf8'));
const atLeast=(actual,min)=>{
 const a=actual.split('.').map(Number),b=min.split('.').map(Number);
 for(let i=0;i<Math.max(a.length,b.length);i++){
  if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0);
 }
 return true;
};
test('Cloudflare security patch is pinned in both manifest and lock with no detached versions',()=>{
 const pkg=read('cloudflare/package.json');
 const lock=read('package-lock.json');
 const wr=pkg.devDependencies.wrangler;
 assert.equal(wr,lock.packages.cloudflare.devDependencies.wrangler);
 assert.equal(wr,lock.packages['node_modules/wrangler'].version);
 assert.ok(atLeast(wr,'4.158.0'));
 assert.ok(atLeast(lock.packages['node_modules/undici'].version,'7.30.1'));
 assert.ok(atLeast(lock.packages['node_modules/miniflare'].version,'5.20261104.0'));
 assert.ok(lock.packages['node_modules/wrangler'].dev);
 assert.ok(lock.packages['node_modules/undici'].dev);
});
test('Expo PKI dependency is patched without changing SDK or native bridge',()=>{
 const lock=read('package-lock.json');
 const forge=lock.packages['node_modules/node-forge'];
 assert.equal(forge.version,'1.4.3');
 assert.equal(forge.resolved,'https://registry.npmjs.org/node-forge/-/node-forge-1.4.3.tgz');
 assert.match(forge.integrity,/^sha512-/);
 for(const dependency of ['@expo/cli','@expo/code-signing-certificates']){
  const range=lock.packages['node_modules/'+dependency].dependencies['node-forge'];
  assert.equal(range,'^1.4.0');
 }
});
test('Expo SDK 58 maintenance update matches proven native Gradle candidate',()=>{
 const android=read('apps/android/package.json');
 const lock=read('package-lock.json');
 const expected={expo:'58.0.23','react-native':'0.88.1','expo-sqlite':'58.0.15','expo-video':'58.0.13','react-native-webview':'14.0.1'};
 for(const [name,version] of Object.entries(expected)){
  assert.equal(android.dependencies[name],version,name);
  assert.equal(lock.packages['apps/android'].dependencies[name],version,name);
  assert.equal(lock.packages['node_modules/'+name].version,version,name);
 }
 const app=read('apps/android/app.json').expo;
 const batch=read('releases/android-batch.json');
 assert.equal(app.android.package,'com.havananice.v2');
 assert.equal(app.version,batch.version,'native package release must require an explicit versioned batch');
 assert.equal(app.android.versionCode,batch.versionCode,'native versionCode must match explicit release');
 assert.equal(batch.approved,true);
 assert.equal(batch.releaseMode,'explicit-batch');
});
test('Android app and WebView versions stay pinned and compatible after native preflight',()=>{
 const android=read('apps/android/package.json');
 const lock=read('package-lock.json');
 assert.equal(android.dependencies.expo,'58.0.23');
 assert.equal(android.dependencies['react-native'],'0.88.1');
 assert.equal(android.dependencies['react-native-webview'],'14.0.1');
 for(const dependency of ['expo','react-native','react-native-webview']){
  assert.equal(android.dependencies[dependency],lock.packages['apps/android'].dependencies[dependency]);
  assert.equal(android.dependencies[dependency],lock.packages['node_modules/'+dependency].version);
 }
});
