// HAVANA NICE V2: optional iOS video JPEG cover, one decoder per selection queue.
export const VIDEO_POSTER_MAX_BYTES=256*1024;
export const VIDEO_POSTER_MAX_EDGE=640;
export function videoPosterSize(w:number,h:number){
 const k=Math.min(1,VIDEO_POSTER_MAX_EDGE/Math.max(w,h,1));
 return {width:Math.max(1,Math.round(w*k)),height:Math.max(1,Math.round(h*k))};
}
const pending=new WeakMap<File,Promise<Blob|null>>();
let decoderTail:Promise<unknown>=Promise.resolve();
// All local and remote extractions share one decoder. Queue time is bounded;
// an expired queued request does not create a video element.
function queuePoster(load:(signal:AbortSignal)=>Promise<Blob|null>,budget:number,owner?:AbortSignal):Promise<Blob|null>{
 const ctl=new AbortController();
 if(owner?.aborted)return Promise.resolve(null);
 const cancel=()=>ctl.abort();
 owner?.addEventListener('abort',cancel,{once:true});
 const timer=setTimeout(cancel,budget);
 const expired=new Promise<null>(resolve=>ctl.signal.addEventListener('abort',()=>resolve(null),{once:true}));
 const task=decoderTail.catch(()=>{}).then(()=>ctl.signal.aborted?null:load(ctl.signal));
 decoderTail=task.catch(()=>{});
 return Promise.race([task,expired]).catch(()=>null).finally(()=>{
  clearTimeout(timer);owner?.removeEventListener('abort',cancel);
 });
}
export function makeChatVideoPoster(file:File):Promise<Blob|null>{
 if(!file.type.startsWith('video/')||!file.size||file.size>512*1024*1024)return Promise.resolve(null);
 const existing=pending.get(file);if(existing)return existing;
 const task=queuePoster(async signal=>{
  const url=URL.createObjectURL(file);
  try{return await extractPoster(url,false,2400,signal);}
  finally{URL.revokeObjectURL(url);}
 },5000).finally(()=>pending.delete(file));
 pending.set(file,task);return task;
}
// Explicit recovery only, never invoked by the scrolling timeline.
export function makeRemoteChatVideoPoster(url:string,owner?:AbortSignal):Promise<Blob|null>{return queuePoster(signal=>extractPoster(url,true,6500,signal),9000,owner);}
function extractPoster(url:string,remote:boolean,timeoutMs:number,signal:AbortSignal):Promise<Blob|null>{
 if(signal.aborted)return Promise.resolve(null);
 return new Promise(resolve=>{
   const video=document.createElement('video');
   if(remote)video.crossOrigin='anonymous';
   let finished=false,started=false,frameId:number|null=null;
   let timer:ReturnType<typeof setTimeout>|null=null;
   const finish=(blob:Blob|null)=>{
     if(finished)return;finished=true;
     signal.removeEventListener('abort',cancel);
     if(timer!==null)clearTimeout(timer);
     if(frameId!==null&&typeof video.cancelVideoFrameCallback==='function')
       try{video.cancelVideoFrameCallback(frameId)}catch{}
     video.onloadeddata=video.onloadedmetadata=video.onseeked=video.oncanplay=video.onerror=null;
     try{video.pause()}catch{}
     video.removeAttribute('src');try{video.load()}catch{}
     resolve(blob?.type==='image/jpeg'&&blob.size>0&&blob.size<=VIDEO_POSTER_MAX_BYTES?blob:null);
   };
   const cancel=()=>finish(null);
   signal.addEventListener('abort',cancel,{once:true});
   const draw=()=>{
     if(finished||started||video.readyState<2||!video.videoWidth)return;
     started=true;
     const {width,height}=videoPosterSize(video.videoWidth,video.videoHeight);
     const canvas=document.createElement('canvas');
     canvas.width=width;canvas.height=height;
     try{
       const ctx=canvas.getContext('2d',{alpha:false});
       if(!ctx){finish(null);return;}
       ctx.drawImage(video,0,0,width,height);
       canvas.toBlob(b=>{canvas.width=0;canvas.height=0;finish(b)},'image/jpeg',.76);
     }catch{canvas.width=0;canvas.height=0;finish(null);}
   };
   const frame=()=>{
     if(finished||started)return;
     if(typeof video.requestVideoFrameCallback==='function')
       try{frameId=video.requestVideoFrameCallback(()=>{frameId=null;draw()});return}catch{}
     draw();
   };
   video.muted=true;video.defaultMuted=true;video.playsInline=true;video.preload='metadata';
   video.onloadeddata=frame;video.onseeked=frame;video.oncanplay=frame;
   video.onloadedmetadata=()=>{
     if(Number.isFinite(video.duration)&&video.duration>.3)
       try{video.currentTime=Math.min(.5,video.duration*.06)}catch{}
     try{void video.play().catch(()=>{if(video.readyState>=2)frame()})}
     catch{if(video.readyState>=2)frame()}
   };
   video.onerror=()=>finish(null);
   timer=setTimeout(()=>finish(null),timeoutMs);
   video.src=url;try{video.load()}catch{finish(null)}
 });
}
