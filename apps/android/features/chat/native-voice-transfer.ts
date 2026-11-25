// Single voice transfer deadline across start, content and send. Cancellation
// never implies the server did not commit: retries use the original UUID.
export type VoiceStart={id:string;ready:boolean;multipart:boolean;sent?:boolean};
export async function transferNativeVoice(
 id:string,ops:{
  start:(signal:AbortSignal)=>Promise<VoiceStart>;
  put:(signal:AbortSignal)=>Promise<void>;
  send:(signal:AbortSignal)=>Promise<{seq:number}>;
 },timeoutMs=25_000,ownerSignal?:AbortSignal,
):Promise<{id:string;seq:number}>{
 const ctl=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 let removeOwner=()=>{};
 const interruption=new Promise<never>((_,reject)=>{
  const cancel=(message:string)=>{ctl.abort();reject(Error(message));};
  timer=setTimeout(()=>cancel('El envío de voz tardó demasiado. Reintenta el mismo audio.'),timeoutMs);
  const onAbort=()=>cancel('El acceso cambió. No se continuó el envío.');
  if(ownerSignal?.aborted)onAbort();
  else if(ownerSignal){
   ownerSignal.addEventListener('abort',onAbort,{once:true});
   removeOwner=()=>ownerSignal.removeEventListener('abort',onAbort);
  }
 });
 const check=()=>{if(ctl.signal.aborted)throw Error('Envío de voz cancelado.');};
 const work=async()=>{
  check();
  const started=await ops.start(ctl.signal);check();
  if(started.id!==id||started.multipart)throw Error('La sesión de voz no coincide con el archivo.');
  if(!started.ready){await ops.put(ctl.signal);check();}
  const result=await ops.send(ctl.signal);check();
  if(!Number.isSafeInteger(result.seq)||result.seq<=0)throw Error('No se pudo confirmar la nota de voz.');
  return {id,seq:result.seq};
 };
 try{return await Promise.race([interruption,work()]);}
 finally{if(timer!==undefined)clearTimeout(timer);removeOwner();}
}
