// HAVANA NICE V2 · same Chat/R2 protocol as the PWA, with native file streaming.
// Direct files (including voice) use the native cancellable binary uploader.
// Videos stream file ranges directly through the native HTTP client.
import {File} from 'expo-file-system';
import {requireOptionalNativeModule} from 'expo';
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
type NativeVideoTransport={
 uploadRange:(uri:string,url:string,token:string,mime:string,start:number,length:number,key:string)=>Promise<{bytes:number;elapsedMs:number}>;
 uploadProgress:(key:string)=>Promise<number>;
 cancelUpload:(key:string)=>Promise<void>;
};
let rangeSerial=0;
async function putVideoRange(file:File,start:number,end:number,url:string,token:string,mimeType:string,signal:AbortSignal,onProgress:(bytes:number)=>void){
 ensure(signal);
 const native=requireOptionalNativeModule<NativeVideoTransport>('HavanaVideoCompression');
 if(!native)throw Error('El transporte nativo de video no está disponible.');
 const key='range-'+Date.now()+'-'+(++rangeSerial);
 const cancel=()=>{void native.cancelUpload(key).catch(()=>{});};
 signal.addEventListener('abort',cancel,{once:true});
 let polling=false,finished=false;
 let timer:ReturnType<typeof setInterval>|undefined;
 try{
  const work=native.uploadRange(file.uri,url,token,mimeType,start,end-start,key);
  if(signal.aborted)cancel();
  timer=setInterval(()=>{
   if(finished||polling||signal.aborted)return;
   polling=true;
   void native.uploadProgress(key).then(bytes=>{
    if(!finished&&!signal.aborted&&Number.isFinite(bytes))onProgress(Math.min(end-start,Math.max(0,bytes)));
   }).catch(()=>{}).finally(()=>{polling=false;});
  },500);
  const result=await work;
  ensure(signal);
  if(result.bytes!==end-start)throw Error('Rango de video incompleto.');
  onProgress(result.bytes);
  if(result.elapsedMs>0)console.info('[HN video] range bytes='+result.bytes+' ms='+result.elapsedMs+
   ' Mbps='+((result.bytes*8/result.elapsedMs)/1000).toFixed(2));
 }finally{
  finished=true;if(timer!==undefined)clearInterval(timer);
  signal.removeEventListener('abort',cancel);
 }
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
    try{await runNativeTransferStep('Subir archivo',picked.kind==='video'?90_000:60_000,signal=>picked.kind==='video'?
     putVideoRange(file,0,file.size,base+'/content',session.token,picked.mimeType,signal,sent=>onProgress(sent,file.size)):
     nativePut(file,base+'/content',session.token,picked.mimeType,sent=>onProgress(sent,file.size),signal),ownerSignal);failure=null;break;}
    catch(e){ensure(ownerSignal);failure=e;if(e instanceof Error&&e.message.includes('tardó demasiado'))break;}
   }
   if(failure)throw failure;
  }else{
   const size=started.partSize,total=started.partCount;
   if(size!==5*1024*1024||total!==Math.ceil(file.size/size))
    throw Error('Partes R2 incompatibles con el archivo original.');
   const completed=new Set((started.completedParts||[]).filter(n=>Number.isInteger(n)&&n>=1&&n<=total));
   const inflight=new Map<number,number>();
   const bytesFor=(index:number)=>Math.min(size,file.size-index*size);
   const report=()=>onProgress([...completed].reduce((sum,number)=>sum+bytesFor(number-1),0)+
    [...inflight].reduce((sum,[number,bytes])=>completed.has(number)?sum:sum+bytes,0),file.size);
   report();
   const transfer=async(number:number)=>{
    if(completed.has(number))return;
    const index=number-1,from=index*size,to=Math.min(file.size,from+size);
    for(let attempt=0;attempt<4;attempt++){
     ensure(ownerSignal);
     if(completed.has(number))return;
     try{
      await runNativeTransferStep('Video: parte '+number+'/'+total,90_000,
       signal=>putVideoRange(file,from,to,base+'/parts/'+number,session.token,picked.mimeType,signal,
        bytes=>{inflight.set(number,bytes);report();}),ownerSignal);
      completed.add(number);inflight.delete(number);report();return;
     }catch(error){
      inflight.delete(number);ensure(ownerSignal);
      try{
       const state=await control<Start>('Recuperar avance del video',base);
       if(state.id!==id)throw Error('Identificador de video incorrecto.');
       for(const part of state.completedParts||[])if(Number.isInteger(part)&&part>=1&&part<=total)completed.add(part);
       report();
      }catch{ensure(ownerSignal);}
      if(completed.has(number))return;
      if(attempt===3)throw Error('Video: parte '+number+'/'+total+' pendiente. '+(error instanceof Error?error.message:'Conexión interrumpida.')+' Reintenta para continuar.');
      await wait([500,1500,3500][attempt]??3500);
     }
    }
   };
   // At most two in a wave, and the shared native dispatcher limits both
   // videos together. Wait for both responses before starting another wave.
   for(let index=0;index<total;index+=2){
    ensure(ownerSignal);
    const numbers=[index+1,index+2].filter(number=>number<=total&&!completed.has(number));
    const results=await Promise.allSettled(numbers.map(transfer));
    const failed=results.find(result=>result.status==='rejected');
    if(failed?.status==='rejected')throw failed.reason;
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
