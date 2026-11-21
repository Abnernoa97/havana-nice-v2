import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
import type {AdminSession} from './admin-api';

// Only a non-extractable P-256 CryptoKey survives in this browser's IndexedDB.
// No password or Administrator bearer is persisted. Enrollment requires one
// successful password login; subsequent visits sign a server one-use challenge.
type Device={id:'current';deviceId:string;privateKey:CryptoKey};
const DB='havana-v2-admin-trusted-browser-v1';
const STORE='device';
const OFFICIAL_HOST='havana-nice-v2.pages.dev';
const message=(id:string,nonce:string)=>
 new TextEncoder().encode('havana-nice-v2-admin-device-v1\n'+id+'\n'+nonce+'\nhttps://'+OFFICIAL_HOST);
function supported(){
 return location.protocol==='https:'&&location.hostname===OFFICIAL_HOST&&
  !!globalThis.indexedDB&&!!globalThis.crypto?.subtle;
}
function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('No se pudo abrir el almacenamiento seguro del dispositivo.'));
 });
}
async function readDevice():Promise<Device|null>{
 if(!supported())return null;
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readonly'),get=tx.objectStore(STORE).get('current');
  get.onsuccess=()=>resolve((get.result as Device|undefined)||null);
  get.onerror=()=>reject(new Error('No se pudo reconocer este dispositivo.'));
  tx.oncomplete=()=>db.close();tx.onerror=()=>db.close();
 });
}
async function putDevice(device:Device):Promise<void>{
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.objectStore(STORE).put(device);
  tx.oncomplete=()=>{db.close();resolve();};
  tx.onerror=()=>{db.close();reject(new Error('No se pudo registrar este dispositivo.'));};
 });
}
async function dropDevice():Promise<void>{
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,'readwrite');
  tx.objectStore(STORE).delete('current');
  tx.oncomplete=()=>{db.close();resolve();};
  tx.onerror=()=>{db.close();reject(new Error('No se pudo desvincular el dispositivo.'));};
 });
}
function base64url(buffer:ArrayBuffer):string{
 return btoa(String.fromCharCode(...new Uint8Array(buffer)))
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}
async function post<T>(path:string,data:unknown,token?:string):Promise<T>{
 const response=await fetch(API+path,{
  method:'POST',cache:'no-store',
  headers:{'Content-Type':'application/json',
   ...(token?{Authorization:'Bearer '+token}:{})},
  body:JSON.stringify(data)
 });
 const json=await response.json().catch(()=>({error:'Acceso no disponible.'})) as T&{error?:string};
 if(!response.ok)throw new Error(json.error||'No se pudo autorizar el dispositivo.');
 return json;
}
export async function restoreAdminDevice():Promise<AdminSession|null>{
 const device=await readDevice();
 if(!device)return null;
 const start=await post<{challengeId:string;challenge:string}>(
  '/api/chat/admin/auth/device/challenge',{deviceId:device.deviceId});
 const signature=await crypto.subtle.sign(
  {name:'ECDSA',hash:'SHA-256'},device.privateKey,
  message(start.challengeId,start.challenge)
 );
 return post<AdminSession>('/api/chat/admin/auth/device/session',{
  deviceId:device.deviceId,challengeId:start.challengeId,
  challenge:start.challenge,signature:base64url(signature)
 });
}
export async function pairAdminDevice(token:string):Promise<boolean>{
 if(!supported())return false;
 if(await readDevice())return true;
 const pair=await crypto.subtle.generateKey(
  {name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']
 ) as CryptoKeyPair;
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);
 const publicKey={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};
 const deviceId=crypto.randomUUID();
 await post<{ok:boolean}>('/api/chat/admin/auth/device/enroll',{deviceId,publicKey},token);
 try{await putDevice({id:'current',deviceId,privateKey:pair.privateKey});}
 catch(error){
  // Never leave an authorized but unusable credential at the server.
  await post('/api/chat/admin/auth/device/revoke',{deviceId},token).catch(()=>{});
  throw error;
 }
 return true;
}
export async function unlinkAdminDevice(token:string):Promise<boolean>{
 const device=await readDevice();
 if(!device)return false;
 await post<{ok:boolean}>('/api/chat/admin/auth/device/revoke',
  {deviceId:device.deviceId},token);
 await dropDevice();
 return true;
}
export async function isAdminDevicePaired():Promise<boolean>{
 try{return !!(await readDevice());}catch{return false;}
}
