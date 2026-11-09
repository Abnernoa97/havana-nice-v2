// HAVANA NICE V2 · Native Chat backend, browser uploader.
// Exactly the Familia-approved fast transport: original Blob, 5MiB chunks,
// three concurrent R2 multipart parts, per-part retries, and stable file identity.
import {HAVANA_V2_DEV_API_BASE_URL as API,type ChatSession} from '@havana/shared';
type Prepare={id:string;kind:string;multipart:boolean;partSize:number;partCount:number;ready:boolean;
 completedParts:number[];sent?:boolean;error?:string};
const savedIds=new WeakMap<File,string>();
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function json(url:string,token:string,method='GET',body?:unknown):Promise<any>{
 const res=await fetch(url,{method,headers:{Authorization:'Bearer '+token,
  ...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});
 const payload=await res.json().catch(()=>({error:'No se pudo leer la respuesta del servidor'}));
 if(!res.ok)throw new Error(payload.error||'Error de transferencia ('+res.status+')');
 return payload;
}
function putBlob(token:string,url:string,blob:Blob,onProgress:(value:number)=>void){
 return new Promise<void>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  xhr.open('PUT',url,true);xhr.setRequestHeader('Authorization','Bearer '+token);
  xhr.setRequestHeader('Content-Type',blob.type||'application/octet-stream');
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.min(blob.size,e.loaded));};
  xhr.onerror=()=>reject(new Error('Se interrumpió la conexión durante la subida.'));
  xhr.ontimeout=()=>reject(new Error('La conexión agotó el tiempo.'));
  xhr.onload=()=>{
   if(xhr.status>=200&&xhr.status<300){onProgress(blob.size);resolve();return;}
   let error='No se pudo subir el archivo ('+xhr.status+')';
   try{error=JSON.parse(xhr.responseText)?.error||error;}catch{}
   reject(new Error(error));
  };
  xhr.send(blob);
 });
}
export async function uploadChatFile(
 session:ChatSession,file:File,kind:'photo'|'video',
 onProgress:(loaded:number,total:number)=>void,stableId?:string
):Promise<{id:string;seq:number}>{
 // Idempotent across iOS camera restarts: the queued item owns its R2 ID.
 // WeakMap remains a safe fallback for older direct-upload callers.
 let id=stableId??savedIds.get(file);
 if(!id){id=crypto.randomUUID();savedIds.set(file,id);}
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
  throw Error('Identificador de transferencia inválido.');
 const base=API+'/api/chat/media/';
 const begin=await json(base+'start',session.token,'POST',{
  id,kind,mimeType:file.type.toLowerCase(),sizeBytes:file.size,name:file.name
 }) as Prepare;
 if(begin.id!==id)throw new Error('El identificador de carga no coincide.');
 if(!begin.ready){
  if(!begin.multipart){
   let last:unknown=null;
   for(let attempt=0;attempt<4;attempt++){
    if(attempt>0){
     const state=await json(base+id,session.token) as Prepare;
     if(state.ready){last=null;break;}
     await delay([450,1200,2500][attempt-1]??2500);
    }
    try{
     await putBlob(session.token,base+id+'/content',file,loaded=>onProgress(loaded,file.size));
     last=null;break;
    }catch(err){last=err;}
   }
   if(last)throw last;
  }else{
   const partSize=begin.partSize;
   if(partSize!==5*1024*1024||begin.partCount!==Math.ceil(file.size/partSize))
    throw new Error('La sesión de subida no coincide con este video.');
   const done=new Set(begin.completedParts||[]);
   const progress=Array.from({length:begin.partCount},(_,i)=>done.has(i+1)?
    Math.min(partSize,file.size-i*partSize):0);
   const report=()=>onProgress(progress.reduce((a,b)=>a+b,0),file.size);
   report();
   let next=0,failed:unknown=null;
   const worker=async()=>{
    while(!failed&&next<begin.partCount){
     const index=next++;
     if(done.has(index+1))continue;
     const start=index*partSize,blob=file.slice(start,Math.min(file.size,start+partSize),file.type);
     for(let attempt=0;attempt<5;attempt++){
      progress[index]=0;report();
      try{
       await putBlob(session.token,base+id+'/parts/'+(index+1),blob,loaded=>{
        progress[index]=loaded;report();
       });
       progress[index]=blob.size;report();break;
      }catch(e){
       if(attempt===4)failed=e;
       else await delay([350,900,1800,3200][attempt]??3200);
      }
     }
    }
   };
   await Promise.all(Array.from({length:Math.min(3,begin.partCount)},()=>worker()));
   if(failed)throw failed;
   await json(base+id+'/complete',session.token,'POST',{});
  }
 }
 onProgress(file.size,file.size);
 const sent=await json(base+id+'/send',session.token,'POST',{}) as {seq?:number};
 if(!Number.isSafeInteger(sent.seq)||!sent.seq)throw new Error('No se confirmó el mensaje.');
 savedIds.delete(file);
 return {id,seq:sent.seq};
}
