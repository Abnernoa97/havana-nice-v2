// Single typed audio catalog for V2 member PWA and the native Android player.
// The API returns temporary, read-only media links, never R2 object keys.
import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';
export interface AudioTrack {
 id:string;title:string;artist:string;album:string;position:number;
 sizeBytes:number;hasCover:boolean;audioUrl:string;coverUrl:string|null;
}
export class AudioApiError extends Error{
 constructor(message:string,readonly status:number){super(message);this.name='AudioApiError';}
}
export function privateAudioUrl(path:string|null):string|null{
 if(!path)return null;
 try{
  const base=new URL(API),url=new URL(path,base);
  return url.origin===base.origin&&url.protocol==='https:'&&
   /^\/api\/audio\/media\/[a-f0-9]{32}$/.test(url.pathname)?url.href:null;
 }catch{return null;}
}
// Private, process-local, member-scoped cache. Never persist grant URLs or share them across users.
// Grants live for 60 minutes on the Worker; this cache lives only 2 minutes.
const AUDIO_CATALOG_CACHE_MS=2*60*1000;
let memberCatalogCache:{token:string;tracks:AudioTrack[];expiresAt:number}|null=null;
let memberCatalogPending:{token:string;promise:Promise<AudioTrack[]>}|null=null;
export function clearAudioTracksCache(token?:string):void{
 if(!token||memberCatalogCache?.token===token)memberCatalogCache=null;
 if(!token||memberCatalogPending?.token===token)memberCatalogPending=null;
}
export async function getAudioTracks(token:string,admin=false,force=false):Promise<AudioTrack[]>{
 if(!admin){
  if(memberCatalogCache&&memberCatalogCache.token!==token)memberCatalogCache=null;
  if(!force&&memberCatalogCache?.token===token&&Date.now()<memberCatalogCache.expiresAt)
   return memberCatalogCache.tracks;
  // Deduplicate simultaneous opens without reusing another member's capabilities.
  if(memberCatalogPending?.token===token)return memberCatalogPending.promise;
 }
 const request=(async()=>{
  const result=await fetch(API+(admin?'/api/audio/admin/tracks':'/api/audio/tracks'),{
   cache:'no-store',headers:{Authorization:'Bearer '+token,Accept:'application/json'}
  });
  const data=await result.json().catch(()=>({})) as {tracks?:AudioTrack[];error?:string};
  if(!result.ok)throw new AudioApiError(data.error||'Biblioteca de audio no disponible',result.status);
  return (data.tracks||[]).filter(t=>privateAudioUrl(t.audioUrl));
 })();
 // Admin always reads live data. A member's manual refresh passes force=true.
 if(admin)return request;
 const pending=request.then(tracks=>{
  if(memberCatalogPending?.promise===pending)
   memberCatalogCache={token,tracks,expiresAt:Date.now()+AUDIO_CATALOG_CACHE_MS};
  return tracks;
 }).catch(error=>{
  if(error instanceof AudioApiError&&(error.status===401||error.status===403))
   clearAudioTracksCache(token);
  throw error;
 }).finally(()=>{
  if(memberCatalogPending?.promise===pending)memberCatalogPending=null;
 });
 memberCatalogPending={token,promise:pending};
 return pending;
}
function uploadBinary(path:string,token:string,file:Blob,meta?:{
 title:string;artist:string;album:string;
}):Promise<{id?:string;ok?:boolean}>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST',API+path);
  xhr.responseType='json';
  xhr.setRequestHeader('Authorization','Bearer '+token);
  xhr.setRequestHeader('Content-Type',file.type);
  if(meta){
   xhr.setRequestHeader('X-Audio-Title',encodeURIComponent(meta.title));
   xhr.setRequestHeader('X-Audio-Artist',encodeURIComponent(meta.artist));
   xhr.setRequestHeader('X-Audio-Album',encodeURIComponent(meta.album));
  }
  xhr.onerror=()=>reject(new Error('No se pudo conectar durante la subida.'));
  xhr.onload=()=>{
   const value=xhr.response as {id?:string;error?:string;ok?:boolean}|null;
   if(xhr.status>=200&&xhr.status<300)resolve(value||{});
   else reject(new AudioApiError(value?.error||'No se pudo guardar audio',xhr.status));
  };
  xhr.send(file);
 });
}
export async function uploadAudioTrack(token:string,file:File,info:{
 title:string;artist:string;album:string;
}):Promise<string>{
 if(!file.size||file.size>30*1024*1024)throw new Error('El audio debe pesar máximo 30 MiB.');
 const result=await uploadBinary('/api/audio/admin/tracks',token,file,info);
 if(!result.id)throw new Error('No se confirmó el archivo.');
 clearAudioTracksCache();
 return result.id;
}
export async function uploadAudioCover(token:string,id:string,blob:Blob):Promise<void>{
 if(!blob.size||blob.size>400*1024)throw new Error('La portada debe pesar menos de 400 KiB.');
 await uploadBinary('/api/audio/admin/tracks/'+encodeURIComponent(id)+'/cover',token,blob);
 clearAudioTracksCache();
}
export async function removeAudioTrack(token:string,id:string):Promise<void>{
 const result=await fetch(API+'/api/audio/admin/tracks/'+encodeURIComponent(id),{
  method:'DELETE',cache:'no-store',headers:{Authorization:'Bearer '+token}
 });
 if(!result.ok){
  const value=await result.json().catch(()=>({})) as {error?:string};
  throw new AudioApiError(value.error||'No se pudo eliminar el audio',result.status);
 }
 clearAudioTracksCache();
}
