// Native Chat only. Bound every network step, even if a transport ignores abort.
// A timeout never claims that a remote write was rolled back: retry the same ID.
export async function runNativeTransferStep<T>(label:string,timeoutMs:number,
 work:(signal:AbortSignal)=>Promise<T>,owner?:AbortSignal):Promise<T>{
 const ctl=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 let cleanup=()=>{};
 const interrupted=new Promise<never>((_,reject)=>{
  const fail=(message:string)=>{reject(Error(message));ctl.abort();};
  const cancel=()=>fail('Envío cancelado por cambio de acceso.');
  if(owner?.aborted){cancel();return;}
  if(owner){owner.addEventListener('abort',cancel,{once:true});cleanup=()=>owner.removeEventListener('abort',cancel);}
  timer=setTimeout(()=>fail(label+': la conexión tardó demasiado. Reintenta el mismo archivo.'),timeoutMs);
 });
 try{return await Promise.race([interrupted,Promise.resolve().then(()=>{
  if(ctl.signal.aborted)throw Error('Envío cancelado.');
  return work(ctl.signal);
 })]);}
 finally{if(timer!==undefined)clearTimeout(timer);cleanup();}
}

export type NativePreparedMedia={publish:()=>Promise<{id:string;seq:number}>};
// Two photographs may upload at once; videos are alone. Publish in original
// selection order, retain unconfirmed originals, and never abandon a sibling task.
export async function transferNativeVisualBatch<T extends {id:string;kind:string;sizeBytes:number}>(
 items:readonly T[],ops:{
  prepare:(item:T,progress:(bytes:number)=>void)=>Promise<NativePreparedMedia>;
  confirmed:(item:T,result:{id:string;seq:number})=>void|Promise<void>;
  progress:(percent:number)=>void;
 },signal:AbortSignal):Promise<void>{
 const total=items.reduce((sum,item)=>sum+item.sizeBytes,0);
 const bytes=new Map<string,number>();
 let previous=-1;
 const report=()=>{
  const value=Math.min(99,Math.floor(100*[...bytes.values()].reduce((a,b)=>a+b,0)/Math.max(1,total)));
  if(!signal.aborted&&value>previous){previous=value;ops.progress(value);}
 };
 const ensure=()=>{if(signal.aborted)throw Error('Envío cancelado.');};
 for(let i=0;i<items.length;){
  ensure();
  const count=items[i]?.kind==='photo'&&items[i+1]?.kind==='photo'?2:1;
  const group=items.slice(i,i+count);
  const pending=group.map(item=>Promise.resolve().then(()=>ops.prepare(item,sent=>{
   if(!Number.isFinite(sent)||signal.aborted)return;
   bytes.set(item.id,Math.max(bytes.get(item.id)||0,Math.min(item.sizeBytes,Math.max(0,sent))));report();
  })).then(value=>({ok:true as const,value}),error=>({ok:false as const,error})));
  try{
   for(let n=0;n<group.length;n++){
    const item=group[n]!,prepared=await pending[n]!;
    ensure();if(!prepared.ok)throw prepared.error;
    const result=await prepared.value.publish();ensure();
    await ops.confirmed(item,result);bytes.set(item.id,item.sizeBytes);report();
   }
  }finally{await Promise.all(pending);}
  i+=count;
 }
 ensure();ops.progress(100);
}
