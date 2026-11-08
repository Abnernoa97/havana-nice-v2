// HAVANA NICE V2 · One batch-progress policy for Chat on iPhone PWA and Android.
// The platform uploaders remain native/browser and transmit full originals.
// This function never retries/duplicates a successful item; failed items remain
// in the caller's queue, just as before extracting the duplicated loops.
export interface ChatMediaBatchOptions<T>{
 sizeOf:(item:T)=>number;
 upload:(item:T,onSentBytes:(bytes:number)=>void)=>Promise<void>;
 confirmed:(item:T)=>void;
 progress:(percent:number)=>void;
}
export async function uploadChatMediaBatch<T>(
 items:readonly T[],options:ChatMediaBatchOptions<T>
):Promise<void>{
 const total=items.reduce((sum,item)=>sum+options.sizeOf(item),0);
 let completedBytes=0;
 for(const item of items){
  const size=options.sizeOf(item);
  await options.upload(item,sent=>{
   const valid=Number.isFinite(sent)?Math.max(0,Math.min(size,sent)):0;
   options.progress(Math.round(100*Math.min(total,completedBytes+valid)/Math.max(total,1)));
  });
  completedBytes+=size;
  // Do not remove the item until its entire R2 upload AND final send succeed.
  options.confirmed(item);
 }
 options.progress(100);
}
