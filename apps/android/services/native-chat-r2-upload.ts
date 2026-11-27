// HAVANA NICE V2 · same Chat/R2 protocol as the PWA, with native file streaming.
// Direct files (including voice) use the native cancellable binary uploader.
// Large videos use sequential 5 MiB parts and bounded 256 KiB I/O.
import {File,Paths,FileMode,UploadType} from 'expo-file-system';
import {nativePut} from './native-chat-binary-upload';
import {runNativeTransferStep,type NativePreparedMedia} from '../features/chat/native-media-transfer';
import {transferNativeVoice,type VoiceStart} from '../features/chat/native-voice-transfer';
import {publishNativeVideoPoster} from './native-chat-video-poster';
import {HAVANA_V2_DEV_API_BASE_URL as API,type ChatSession,type ChatMediaSelection} from '@havana/shared';

type NativeFile=(ChatMediaSelection|{kind:'audio';source:'camera';name:string;mimeType:string;sizeBytes:number;uri:string})&{id:string};
type Start={id:string;ready:boolean;multipart:boolean;partSize:number;
 partCount:number;completedParts:number[];sent?:boolean};
const ids=new Map<string,string>();
const wait=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const ensure=(signal?:AbortSignal)=>{if(signal?.aborted)throw Error('Envío cancelado.');};
// File identity is stable for the selected native gallery item until confirmed.
function uuid(){
 return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,letter=>{
  const random=Math.floor(Math.random()*16);
  return (letter==='x'?random:(random&3|8)).toString(16);
 });
}
async function request<T>(url:string,token:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(url,{method,headers:{Authorization:'Bearer '+token,Accept:'application/json',
  ...(body===undefined?{}:{'Content-Type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',...(signal?{signal}:{})});
 const result=await response.json().catch(()=>({error:'Respuesta del servidor no disponible'}));
 if(!response.ok)throw Error(result.error||'Error de conexión ('+response.status+')');
 return result as T;
}
// One video part at a time. Use small read/write buffers and the SDK's
// immediate native upload API, not overlapping disposable task objects.
const VIDEO_IO_BUFFER=256*1024;
let partSerial=0;
async function putPart(file:File,start:number,end:number,url:string,token:string,mimeType:string,signal:AbortSignal){
 ensure(signal);
 const temporary=new File(Paths.cache,'hn-v2-chat-upload-part-'+Date.now()+'-'+(++partSerial)+'.part');
 try{
  temporary.create();
  const input=file.open(FileMode.ReadOnly);
  try{
   input.offset=start;
   const output=temporary.open(FileMode.WriteOnly);
   try{
    let remaining=end-start;
    while(remaining>0){
     ensure(signal);
     const bytes=await input.readBytes(Math.min(VIDEO_IO_BUFFER,remaining));
     if(!bytes.length||bytes.length>remaining)throw Error('Fragmento original incompleto.');
     ensure(signal);
     await output.writeBytes(bytes);
     remaining-=bytes.length;
    }
   }finally{output.close();}
  }finally{input.close();}
  ensure(signal);
  if(temporary.size!==end-start)throw Error('Fragmento temporal incompleto.');
  const result=await temporary.upload(url,{httpMethod:'PUT',uploadType:UploadType.BINARY_CONTENT,
   headers:{Authorization:'Bearer '+token,'Content-Type':mimeType,'Content-Length':String(temporary.size)},signal});
  if(result.status<200||result.status>=300)throw Error('El servidor rechazó una parte del video ('+result.status+').');
  ensure(signal);
 }finally{try{if(temporary.exists)temporary.delete();}catch{}}
}
export async function uploadNativeChatFile(session:ChatSession,picked:NativeFile,
 onProgress:(sent:number,total:number)=>void,ownerSignal?:AbortSignal):Promise<{id:string;seq:number}>{
 const file=new File(picked.uri);
 if(!file.exists||file.size!==picked.sizeBytes||file.size<=0)
  throw Error('El original ya no está disponible. Selecciónalo de nuevo.');
 // Use the durable queue ID whenever it is a UUID so retry after MainActivity
 // destruction cannot accidentally publish the same photo twice.
 const stable=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(picked.id);
 const id=stable?picked.id:(ids.get(picked.id)||uuid());
 ids.set(picked.id,id);
 const base=API+'/api/chat/media/'+id;
 if(picked.kind==='audio'){
  // Production D1 showed a 71 KB voice stuck at pending after start. Use
  // the same native binary path that successfully delivered the five photos.
  const result=await transferNativeVoice(id,{
   start:signal=>request<VoiceStart>(API+'/api/chat/media/start',session.token,'POST',{
    id,kind:picked.kind,mimeType:picked.mimeType,sizeBytes:file.size,name:picked.name},signal),
   put:signal=>nativePut(file,base+'/content',session.token,picked.mimeType,
    sent=>onProgress(sent,file.size),signal),
   send:signal=>request<{seq:number}>(base+'/send',session.token,'POST',{},signal),
  },25_000,ownerSignal);
  ids.delete(picked.id);return result;
 }
 const prepared=await prepareNativeChatFile(session,picked,onProgress,ownerSignal);
 return prepared.publish();
}

export async function prepareNativeChatFile(session:ChatSession,picked:NativeFile,
 onProgress:(sent:number,total:number)=>void,ownerSignal?:AbortSignal):Promise<NativePreparedMedia>{
 ensure(ownerSignal);
 if(picked.kind==='audio')throw Error('El audio utiliza el envío de voz.');
 const file=new File(picked.uri);
 if(!file.exists||file.size!==picked.sizeBytes||file.size<=0)throw Error('El original ya no está disponible.');
 const stable=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(picked.id);
 const id=stable?picked.id:(ids.get(picked.id)||uuid());
 ids.set(picked.id,id);
 const base=API+'/api/chat/media/'+id;
 const control=<T,>(label:string,url:string,method='GET',body?:unknown)=>runNativeTransferStep<T>(label,20_000,
  signal=>request<T>(url,session.token,method,body,signal),ownerSignal);
 const started=await control<Start>('Preparar archivo',API+'/api/chat/media/start','POST',{
  id,kind:picked.kind,mimeType:picked.mimeType,sizeBytes:file.size,name:picked.name});
 if(started.id!==id)throw Error('La sesión no coincide con el original.');
 if(!started.ready){
  if(!started.multipart){
   let failure:unknown=null;
   for(let attempt=0;attempt<2;attempt++){
    if(attempt>0){
     ensure(ownerSignal);
     const state=await control<Start>('Verificar archivo',base);
     if(state.ready){failure=null;break;}
     await wait([450,1200,2500][attempt-1]??2500);
    }
    try{await runNativeTransferStep('Subir archivo',60_000,signal=>nativePut(file,base+'/content',session.token,picked.mimeType,
     sent=>onProgress(sent,file.size),signal),ownerSignal);failure=null;break;}
    catch(e){ensure(ownerSignal);failure=e;if(e instanceof Error&&e.message.includes('tardó demasiado'))break;}
   }
   if(failure)throw failure;
  }else{
   const size=started.partSize,total=started.partCount;
   if(size!==5*1024*1024||total!==Math.ceil(file.size/size))
    throw Error('Partes R2 incompatibles con el archivo original.');
   const completed=new Set(started.completedParts||[]);
   const bytesFor=(index:number)=>Math.min(size,file.size-index*size);
   const report=()=>onProgress([...completed].reduce((sum,number)=>
    number>=1&&number<=total?sum+bytesFor(number-1):sum,0),file.size);
   report();
   // After an ambiguous timeout or cancellation, reconcile R2 state before
   // retrying the same part. Never upload a confirmed part again unnecessarily.
   for(let index=0;index<total;index++){
    ensure(ownerSignal);
    const number=index+1;
    if(completed.has(number))continue;
    const from=index*size,to=Math.min(file.size,from+size);
    for(let attempt=0;attempt<4;attempt++){
     try{
      await runNativeTransferStep('Video: parte '+number+'/'+total,90_000,
       signal=>putPart(file,from,to,base+'/parts/'+number,session.token,picked.mimeType,signal),ownerSignal);
      completed.add(number);report();break;
     }catch(error){
      ensure(ownerSignal);
      try{
       const state=await control<Start>('Recuperar avance del video',base);
       if(state.id!==id)throw Error('Identificador de video incorrecto.');
       for(const part of state.completedParts||[])if(part>=1&&part<=total)completed.add(part);
       report();
      }catch{ensure(ownerSignal);}
      if(completed.has(number))break;
      if(attempt===3)throw Error('Video: parte '+number+'/'+total+' pendiente. '+(error instanceof Error?error.message:'Conexión interrumpida.')+' Reintenta para continuar.');
      await wait([500,1500,3500][attempt]??3500);
     }
    }
   }
   ensure(ownerSignal);
   if(completed.size!==total)throw Error('Faltan fragmentos del video. Reintenta para continuar.');
   await control('Finalizar video',base+'/complete','POST',{});
  }
 }
 onProgress(file.size,file.size);
 // The original is confirmed first; a JPEG failure never prevents sending it.
 if(picked.kind==='video')await publishNativeVideoPoster(session.token,id,picked.uri,4500,ownerSignal);
 ensure(ownerSignal);
 return {publish:async()=>{
  ensure(ownerSignal);
  const message=await control<{seq:number}>('Confirmar mensaje',base+'/send','POST',{});
  if(!Number.isSafeInteger(message.seq)||message.seq<=0)throw Error('No se pudo confirmar el mensaje enviado.');
  ids.delete(picked.id);return {id,seq:message.seq};
 }};
}
