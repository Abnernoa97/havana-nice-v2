// HAVANA NICE V2 · same Chat/R2 protocol as the PWA, with native file streaming.
// Stream directly from disk without encoded copies: Expo File and 5 MiB parts
// are streamed through expo/fetch. Exactly three concurrent parts per video.
import {File,UploadType} from 'expo-file-system';
import {fetch as expoFetch} from 'expo/fetch';
import {HAVANA_V2_DEV_API_BASE_URL as API,type ChatSession,type ChatMediaSelection} from '@havana/shared';

type NativeFile=ChatMediaSelection&{id:string};
type Start={id:string;ready:boolean;multipart:boolean;partSize:number;
 partCount:number;completedParts:number[];sent?:boolean};
const ids=new Map<string,string>();
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
// File identity is stable for the selected native gallery item until confirmed.
function uuid(){
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,letter=>{
  const random=Math.floor(Math.random()*16);
  return (letter==='x'?random:(random&3|8)).toString(16);
 });
}
async function request<T>(url:string,token:string,method='GET',body?:unknown):Promise<T>{
 const response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json',
  ...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});
 const result=await response.json().catch(()=>({error:'Respuesta del servidor no disponible'}));
 if(!response.ok)throw Error(result.error||'Error de conexión ('+response.status+')');
 return result as T;
}
async function nativePut(file:File,url:string,token:string,mimeType:string,
 onProgress?:(bytes:number)=>void){
 const task=file.createUploadTask(url,{httpMethod:'PUT',uploadType:UploadType.BINARY_CONTENT,
  headers:{Authorization:'Bearer '+token,'Content-Type':mimeType,'Content-Length':String(file.size)},
  onProgress:p=>onProgress?.(Math.min(file.size,p.bytesSent))});
 try{
  const result=await task.uploadAsync();
  if(result.status<200||result.status>=300){
   let message='No se pudo enviar el archivo ('+result.status+')';
   try{message=JSON.parse(result.body).error||message;}catch{}
   throw Error(message);
  }
  onProgress?.(file.size);
 }finally{task.release();}
}
async function putPart(file:File,start:number,end:number,url:string,token:string,mimeType:string){
 // expo/fetch supports Expo File.slice Blob bodies without loading the full file.
 const blob=file.slice(start,end,mimeType);
 const result=await expoFetch(url,{method:'PUT',
  headers:{Authorization:'Bearer '+token,'Content-Type':mimeType,'Content-Length':String(end-start)},
  body:blob});
 if(!result.ok){
  const body=await result.json().catch(()=>({error:'No se guardó el fragmento'}));
  throw Error(body.error||'Error enviando fragmento ('+result.status+')');
 }
}
export async function uploadNativeChatFile(session:ChatSession,picked:NativeFile,
 onProgress:(sent:number,total:number)=>void):Promise<{id:string;seq:number}>{
 const file=new File(picked.uri);
 if(!file.exists||file.size!==picked.sizeBytes||file.size<=0)
  throw Error('El original ya no está disponible. Selecciónalo de nuevo.');
 const id=ids.get(picked.id)||uuid();
 ids.set(picked.id,id);
 const base=API+'/api/chat/media/'+id;
 const started=await request<Start>(API+'/api/chat/media/start',session.token,'POST',{
  id,kind:picked.kind,mimeType:picked.mimeType,sizeBytes:file.size,name:picked.name});
 if(started.id!==id)throw Error('La sesión no coincide con el original.');
 if(!started.ready){
  if(!started.multipart){
   let failure:unknown=null;
   for(let attempt=0;attempt<4;attempt++){
    if(attempt>0){
     const state=await request<Start>(base,session.token);
     if(state.ready){failure=null;break;}
     await wait([450,1200,2500][attempt-1]??2500);
    }
    try{await nativePut(file,base+'/content',session.token,picked.mimeType,
     sent=>onProgress(sent,file.size));failure=null;break;}
    catch(e){failure=e;}
   }
   if(failure)throw failure;
  }else{
   const size=started.partSize,total=started.partCount;
   if(size!==5*1024*1024||total!==Math.ceil(file.size/size))
    throw Error('Partes R2 incompatibles con el archivo original.');
   const completed=new Set(started.completedParts||[]);
   const progress=Array.from({length:total},(_,i)=>completed.has(i+1)?
    Math.min(size,file.size-i*size):0);
   const report=()=>onProgress(progress.reduce((sum,value)=>sum+value,0),file.size);
   report();
   let next=0,firstFailure:unknown=null;
   const worker=async()=>{
    while(firstFailure===null&&next<total){
     const index=next++;
     if(completed.has(index+1))continue;
     const from=index*size,to=Math.min(file.size,from+size);
     for(let attempt=0;attempt<5;attempt++){
      try{
       await putPart(file,from,to,base+'/parts/'+(index+1),session.token,picked.mimeType);
       progress[index]=to-from;report();break;
      }catch(e){
       if(attempt===4){firstFailure=e;break;}
       await wait([350,900,1800,3200][attempt]??3200);
      }
     }
    }
   };
   await Promise.all(Array.from({length:Math.min(3,total)},()=>worker()));
   if(firstFailure)throw firstFailure;
   await request(base+'/complete',session.token,'POST',{});
  }
 }
 onProgress(file.size,file.size);
 const message=await request<{seq:number}>(base+'/send',session.token,'POST',{});
 if(!Number.isSafeInteger(message.seq)||message.seq<=0)
  throw Error('No se pudo confirmar el mensaje enviado.');
 ids.delete(picked.id);
 return {id,seq:message.seq};
}
