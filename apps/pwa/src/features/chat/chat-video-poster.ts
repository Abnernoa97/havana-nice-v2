// HAVANA NICE V2: optional iOS video JPEG cover, one decoder per selection queue.
export const VIDEO_POSTER_MAX_BYTES=256*1024;
export const VIDEO_POSTER_MAX_EDGE=640;
export function videoPosterSize(w:number,h:number){
 const k=Math.min(1,VIDEO_POSTER_MAX_EDGE/Math.max(w,h,1));
 return {width:Math.max(1,Math.round(w*k)),height:Math.max(1,Math.round(h*k))};
}
export function makeChatVideoPoster(file:File):Promise<Blob|null>{
 if(!file.type.startsWith('video/')||!file.size||file.size>512*1024*1024)
   return Promise.resolve(null);
 return new Promise(resolve=>{
   const url=URL.createObjectURL(file),video=document.createElement('video');
   let finished=false,started=false,frameId:number|null=null;
   let timer:ReturnType<typeof setTimeout>|null=null;
   const finish=(blob:Blob|null)=>{
     if(finished)return;finished=true;
     if(timer!==null)clearTimeout(timer);
     if(frameId!==null&&typeof video.cancelVideoFrameCallback==='function')
       try{video.cancelVideoFrameCallback(frameId)}catch{}
     video.onloadeddata=video.onloadedmetadata=video.onseeked=video.oncanplay=video.onerror=null;
     try{video.pause()}catch{}
     video.removeAttribute('src');try{video.load()}catch{}
     URL.revokeObjectURL(url);
     resolve(blob?.type==='image/jpeg'&&blob.size>0&&blob.size<=VIDEO_POSTER_MAX_BYTES?blob:null);
   };
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
   timer=setTimeout(()=>finish(null),2400);
   video.src=url;try{video.load()}catch{finish(null)}
 });
}
