/** Extract a real small frame locally. No external service, mock image or
 * re-encoding of the original MP4/MOV. Browser codec failures are nonfatal. */
export async function createFamilyVideoPoster(source:File|string):Promise<Blob|null>{
 if(typeof document==='undefined')return null;
 const video=document.createElement('video');
 const objectUrl=typeof source==='string'?null:URL.createObjectURL(source);
 video.muted=true;video.playsInline=true;video.preload='auto';video.crossOrigin='anonymous';
 const url=objectUrl||source as string;
 const loaded=()=>new Promise<void>((resolve,reject)=>{
  const timeout=window.setTimeout(()=>{cleanup();reject(new Error('Video sin cuadro disponible'));},8500);
  const cleanup=()=>{
   window.clearTimeout(timeout);video.removeEventListener('loadeddata',ok);
   video.removeEventListener('error',fail);
  };
  const ok=()=>{cleanup();resolve();},fail=()=>{cleanup();reject(new Error('Códec no compatible'));};
  video.addEventListener('loadeddata',ok,{once:true});
  video.addEventListener('error',fail,{once:true});
 });
 try{
  const first=loaded();video.src=url;video.load();await first;
  if(!video.videoWidth||!video.videoHeight)return null;
  const target=Number.isFinite(video.duration)&&video.duration>1.5?
   Math.min(1,video.duration/4):0;
  if(target&&video.seekable.length){
   await new Promise<void>(resolve=>{
    const timeout=window.setTimeout(()=>{video.removeEventListener('seeked',finish);resolve();},3000);
    const finish=()=>{window.clearTimeout(timeout);video.removeEventListener('seeked',finish);resolve();};
    video.addEventListener('seeked',finish,{once:true});
    try{video.currentTime=target;}catch{finish();}
   });
  }
  const factor=Math.min(1,480/video.videoWidth,320/video.videoHeight);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(video.videoWidth*factor));
  canvas.height=Math.max(1,Math.round(video.videoHeight*factor));
  const ctx=canvas.getContext('2d');
  if(!ctx)return null;
  ctx.drawImage(video,0,0,canvas.width,canvas.height);
  const encode=(type:string,quality:number)=>new Promise<Blob|null>(
   resolve=>canvas.toBlob(resolve,type,quality));
  let poster=await encode('image/webp',0.70);
  if(!poster||poster.type!=='image/webp')poster=await encode('image/jpeg',0.72);
  if(poster&&poster.size>384*1024)poster=await encode('image/jpeg',0.48);
  return poster&&poster.size>=64&&poster.size<=384*1024?poster:null;
 }catch{return null;}
 finally{
  video.pause();video.removeAttribute('src');video.load();
  if(objectUrl)URL.revokeObjectURL(objectUrl);
 }
}
