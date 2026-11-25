import {File,UploadType} from 'expo-file-system';
const ensure=(signal?:AbortSignal)=>{if(signal?.aborted)throw Error('Envío cancelado.');};
export async function nativePut(file:File,url:string,token:string,mimeType:string,
 onProgress?:(bytes:number)=>void,signal?:AbortSignal){
 ensure(signal);
 const task=file.createUploadTask(url,{httpMethod:'PUT',uploadType:UploadType.BINARY_CONTENT,
  headers:{Authorization:'Bearer '+token,'Content-Type':mimeType,'Content-Length':String(file.size)},
  ...(signal?{signal}:{}),
  onProgress:p=>{if(!signal?.aborted)onProgress?.(Math.min(file.size,p.bytesSent));}});
 try{
  const result=await task.uploadAsync();
  if(result.status<200||result.status>=300){
   let message='No se pudo enviar el archivo ('+result.status+')';
   try{message=JSON.parse(result.body).error||message;}catch{}
   throw Error(message);
  }
  ensure(signal);onProgress?.(file.size);
 }finally{task.release();}
}
