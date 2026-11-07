import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';

export class FamilyApiError extends Error {
 constructor(message:string,readonly status:number){super(message);this.name='FamilyApiError';}
}

/** Authorized temporary Worker grants only; never original R2 object URLs. */
export interface FamilyMediaItem {
 id:string;
 kind:'photo'|'video';
 thumbnailUrl:string|null;
 fileUrl:string;
 alt?:string;
}

export interface FamilyAlbum {
 actorId:string;
 name:string;
 photoCount:number;
 videoCount:number;
 coverUrl:string|null;
 mediaReady:boolean;
}
/** One consistent count caption in musician and Admin galleries. */
export function familyAlbumCount(album:Pick<FamilyAlbum,'photoCount'|'videoCount'>):string{
 return album.photoCount+' '+(album.photoCount===1?'imagen':'imágenes')+
  ' · '+album.videoCount+' '+(album.videoCount===1?'video':'videos');
}
export interface FamilyStorageUsage {
 usedBytes:number;pendingBytes:number;maxBytes:number;warningBytes:number;
 remainingBytes:number;warning:boolean;stopped:boolean;
}
export interface FamilyDirectory {
 section:'Familia HAVANA NICE';
 albums:FamilyAlbum[];
 mediaReady:boolean;
 storage?:FamilyStorageUsage; // Admin only; server-calculated, includes pending transfers.
}
/** Uses the existing authorized musician or Administrator session, never a new login. */
export async function getFamilyDirectory(token:string,admin=false):Promise<FamilyDirectory>{
 const path=admin?'/api/family/admin/albums':'/api/family/albums';
 const response=await fetch(API+path,{cache:'no-store',
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 const data=await response.json() as FamilyDirectory&{error?:string};
 if(!response.ok)throw new FamilyApiError(data.error||'No se pudo consultar Familia HAVANA NICE.',response.status);
 return data;
}

export interface FamilyAlbumMediaResponse {
 actorId:string;
 items:FamilyMediaItem[];
}
/** Only roster-authorized sessions may enumerate an album's private media. */
export async function getFamilyAlbumMedia(token:string,actorId:string,admin=false):Promise<FamilyAlbumMediaResponse>{
 const path=(admin?'/api/family/admin/albums/':'/api/family/albums/')+encodeURIComponent(actorId)+'/media';
 const response=await fetch(API+path,{cache:'no-store',
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 const data=await response.json() as FamilyAlbumMediaResponse&{error?:string};
 if(!response.ok)throw new FamilyApiError(data.error||'No se pudo abrir el álbum privado.',response.status);
 return data;
}
/** Browser upload progress, shared by small files and bounded video parts.
 * No browser-side compression: originals stay identical in the private R2 bucket. */
function sendFamilyBinary(
 token:string,url:string,blob:Blob,onProgress?:(sentBytes:number,totalBytes:number)=>void,
 uploadId?:string
):Promise<string|undefined>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('POST',url,true);
  xhr.setRequestHeader('Authorization','Bearer '+token);
  xhr.setRequestHeader('Content-Type',blob.type||'application/octet-stream');
  if(uploadId)xhr.setRequestHeader('X-Havana-V2-Upload-ID',uploadId);
  xhr.responseType='json';
  xhr.upload.onprogress=event=>{
   if(event.lengthComputable&&blob.size>0)onProgress?.(Math.min(event.loaded,blob.size),blob.size);
  };
  xhr.onerror=()=>reject(new Error('Se interrumpió la conexión durante la subida.'));
  xhr.onabort=()=>reject(new Error('Se canceló la subida.'));
  xhr.onload=()=>{
   const result=xhr.response as {error?:string;id?:string}|null;
   if(xhr.status>=200&&xhr.status<300){
    onProgress?.(blob.size,blob.size);resolve(result?.id);
   }else reject(new FamilyApiError(result?.error||'No se pudo guardar el archivo.',xhr.status));
  };
  xhr.send(blob);
 });
}
/** Keep one unfinished transfer attached to the actual File object in this page.
 * Retrying a failed selection does not allocate another R2 object or resend saved parts.
 * No login tokens, file bytes, or private R2 keys are persisted in local storage. */
const pendingFamilyUploads=new WeakMap<File,{
 actorId:string;id:string;partSize:number;partCount:number
}>();
const waitToRetry=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function familyMultipartOriginal(
 token:string,actorId:string,file:File,onProgress?:(sentBytes:number,totalBytes:number)=>void
):Promise<string>{
 const base=API+'/api/family/admin/albums/'+encodeURIComponent(actorId)+'/multipart';
 const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 type ResumeStatus={id?:string;partSize?:number;partCount?:number;
  completedParts?:number[];complete?:boolean;error?:string};
 let remembered=pendingFamilyUploads.get(file);
 if(remembered&&remembered.actorId!==actorId){
  pendingFamilyUploads.delete(file);remembered=undefined;
 }
 let init:ResumeStatus|null=null;
 if(remembered){
  // An interrupted response can happen *after* D1 has committed the video.
  // The Admin-only status endpoint distinguishes completed from resumable.
  const status=await fetch(base+'/'+encodeURIComponent(remembered.id),{
   method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+token}});
  const state=await status.json() as ResumeStatus;
  if(status.ok){
   if(state.complete){
    pendingFamilyUploads.delete(file);
    onProgress?.(file.size,file.size);
    return remembered.id;
   }
   if(state.id===remembered.id&&state.partCount===remembered.partCount&&
    state.partSize===remembered.partSize)init=state;
   else throw new Error('La transferencia guardada no coincide con este archivo.');
  }else if(status.status===404||status.status===410){
   pendingFamilyUploads.delete(file);remembered=undefined;
  }else throw new FamilyApiError(state.error||'No se pudo reanudar el video.',status.status);
 }
 if(!init){
  const started=await fetch(base,{method:'POST',cache:'no-store',headers,
   body:JSON.stringify({mimeType:file.type,sizeBytes:file.size})});
  const next=await started.json() as ResumeStatus;
  if(!started.ok)throw new FamilyApiError(next.error||'No se pudo iniciar la carga.',started.status);
  if(!next.id||!Number.isInteger(next.partCount)||!Number.isInteger(next.partSize)||
   !next.partCount||!next.partSize||next.partCount>2000||
   Math.ceil(file.size/next.partSize)!==next.partCount)
   throw new Error('Respuesta de preparación de carga incompleta.');
  init=next;
  pendingFamilyUploads.set(file,{actorId,id:next.id,partSize:next.partSize,partCount:next.partCount});
 }
 const id=init.id!,partSize=init.partSize!,partCount=init.partCount!;
 const url=base+'/'+encodeURIComponent(id);
 const completed=new Set((init.completedParts||[]).filter(
  part=>Number.isInteger(part)&&part>0&&part<=partCount));
 const progress=Array.from({length:partCount},(_,index)=>{
  const start=index*partSize;
  return completed.has(index+1)?Math.min(partSize,file.size-start):0;
 });
 const report=()=>onProgress?.(Math.min(file.size,progress.reduce((sum,n)=>sum+n,0)),file.size);
 report();
 let cursor=0,firstError:unknown=null;
 const worker=async()=>{
  while(firstError===null&&cursor<partCount){
   const index=cursor++;
   if(completed.has(index+1))continue;
   const begin=index*partSize;
   const chunk=file.slice(begin,Math.min(file.size,begin+partSize),file.type);
   for(let attempt=0;attempt<5;attempt++){
    progress[index]=0;report();
    try{
     await sendFamilyBinary(token,url+'/parts/'+(index+1),chunk,sent=>{
      progress[index]=sent;report();
     });
     progress[index]=chunk.size;report();
     break;
    }catch(e){
     if(e instanceof FamilyApiError&&[400,401,403,404,410,413,415].includes(e.status)||
      attempt===4){firstError=e;break;}
     // A transient cellular interruption must not discard successfully sent parts.
     await waitToRetry([350,900,1800,3200][attempt]||3200);
    }
   }
  }
 };
 // Preserve the existing successful 3-part fast path. Retry only failed chunks.
 await Promise.all(Array.from({length:Math.min(3,partCount)},()=>worker()));
 if(firstError!==null){
  // Do not abort R2 here. The existing Admin retry button resumes this exact ID.
  // The session expires server-side; R2 aborts abandoned uploads within 24h.
  throw firstError;
 }
 let response:Response;
 try{
  response=await fetch(url+'/complete',{method:'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+token}});
 }catch{
  throw new Error('No se pudo confirmar la carga. Reintenta para verificar si ya quedó guardada.');
 }
 const result=await response.json() as {id?:string;error?:string};
 if(!response.ok)throw new FamilyApiError(result.error||'No se pudo finalizar el archivo.',response.status);
 if(result.id!==id)throw new Error('Identificador de carga inesperado.');
 pendingFamilyUploads.delete(file);
 onProgress?.(file.size,file.size);
 return id;
}
/** Retry small originals in place without duplicating an object when the browser
 * loses a response after R2 and D1 have already saved it. Same Admin endpoint. */
const directFamilyIds=new WeakMap<File,string>();
async function familyDirectOriginal(
 token:string,actorId:string,file:File,onProgress?:(sentBytes:number,totalBytes:number)=>void
):Promise<string>{
 const base=API+'/api/family/admin/albums/'+encodeURIComponent(actorId)+'/media';
 let uploadId=directFamilyIds.get(file);
 if(!uploadId){uploadId=crypto.randomUUID();directFamilyIds.set(file,uploadId);}
 const verify=async()=>{
  const response=await fetch(base+'/'+encodeURIComponent(uploadId),{method:'GET',
   cache:'no-store',headers:{Authorization:'Bearer '+token}});
  if(response.status===404)return false;
  const data=await response.json() as {id?:string;mimeType?:string;sizeBytes?:number;error?:string};
  if(!response.ok)throw new FamilyApiError(data.error||'No se pudo verificar la carga.',response.status);
  if(data.id!==uploadId||data.sizeBytes!==file.size||data.mimeType!==file.type)
   throw new Error('El archivo guardado no coincide con esta transferencia.');
  directFamilyIds.delete(file);
  onProgress?.(file.size,file.size);
  return true;
 };
 let lastError:unknown=null;
 for(let attempt=0;attempt<4;attempt++){
  if(attempt>0){
   // The last HTTP response may have been lost even when storage succeeded.
   if(await verify())return uploadId;
   await waitToRetry([400,1200,2800][attempt-1]||2800);
  }
  try{
   const savedId=await sendFamilyBinary(token,base,file,onProgress,uploadId);
   if(savedId!==uploadId)throw new Error('Identificador de archivo inesperado.');
   directFamilyIds.delete(file);
   return uploadId;
  }catch(e){
   lastError=e;
   if(e instanceof FamilyApiError&&[400,401,403,404,413,415].includes(e.status))
    throw e;
  }
 }
 // Keep the exact File identity for the existing "retry failed files" action.
 if(await verify())return uploadId;
 throw lastError||new Error('La conexión interrumpió el envío. Reintenta solo este archivo.');
}
/** A single canonical upload action. Large original photos and videos use R2 multipart. */
export async function uploadFamilyAlbumFile(
 token:string,actorId:string,file:File,onProgress?:(sentBytes:number,totalBytes:number)=>void
):Promise<string>{
 if(file.size<=0)throw new Error('El archivo está vacío.');
 if(file.size>9_500_000_000)
  throw new Error('El archivo supera la capacidad total de Familia (9.5 GB).');
 // Large photos and videos share the existing private R2 multipart pipeline.
 if(file.size>15*1024*1024){
  return familyMultipartOriginal(token,actorId,file,onProgress);
 }
 return familyDirectOriginal(token,actorId,file,onProgress);
}

/** Private short-lived video preview, routed through the existing Admin session. */
export async function uploadFamilyVideoPoster(
 token:string,actorId:string,videoId:string,poster:Blob
):Promise<void>{
 const url=API+'/api/family/admin/albums/'+encodeURIComponent(actorId)+
  '/media/'+encodeURIComponent(videoId)+'/poster';
 await sendFamilyBinary(token,url,poster);
}

/** Administrator-only maintenance of original R2 media, never Chat attachments. */
export async function updateFamilyAlbumFile(token:string,actorId:string,mediaId:string,action:'delete'|'cover'):Promise<void>{
 const route=API+'/api/family/admin/albums/'+encodeURIComponent(actorId)+
  '/media/'+encodeURIComponent(mediaId)+(action==='cover'?'/cover':'');
 const response=await fetch(route,{method:action==='delete'?'DELETE':'POST',
  cache:'no-store',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 const result=await response.json() as {error?:string};
 if(!response.ok)throw new FamilyApiError(result.error||'No se pudo administrar el archivo.',response.status);
}
