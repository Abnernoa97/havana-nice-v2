import {useEffect,useRef,useState,type ReactNode} from 'react';
import {readPrivateImage,storePrivateImage} from '../../services/private-image-cache';

type Props={
 token:string|undefined;cacheKey:string;src:string|null|undefined;alt:string;
 className?:string;loading?:'eager'|'lazy';decoding?:'async'|'sync'|'auto';
 fallback?:ReactNode;onError?:()=>void;expiresAt?:number;
};
type Prepared={identity:string;url:string};
// Safari must receive a real <img src> in the FIRST render. IndexedDB, AES-GCM,
// canvas reduction and renewed grants never gate the visibility of the picture.
type Job={image:HTMLImageElement;token:string;key:string;expiresAt:number;cancelled:boolean};
const jobs:Job[]=[];
let working=false;
let scheduled=false;
function drain(){
 scheduled=false;
 if(working)return;
 while(jobs[0]?.cancelled)jobs.shift();
 const job=jobs.shift();if(!job)return;
 working=true;
 const finish=()=>{
  working=false;
  if(jobs.length&&!scheduled){scheduled=true;window.setTimeout(drain,300);}
 };
 const run=async()=>{
  try{
   if(job.cancelled||!job.image.complete||!job.image.naturalWidth)return;
   // Decode is finished and the image has already appeared on-screen.
   const canvas=document.createElement('canvas');
   const scale=Math.min(1,480/Math.max(job.image.naturalWidth,job.image.naturalHeight));
   canvas.width=Math.max(1,Math.round(job.image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(job.image.naturalHeight*scale));
   const ctx=canvas.getContext('2d');
   if(!ctx)return;
   ctx.drawImage(job.image,0,0,canvas.width,canvas.height);
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',0.73));
   canvas.width=0;canvas.height=0;
   if(!job.cancelled&&blob)
    await storePrivateImage(job.token,job.key,blob,job.expiresAt);
  }catch{/* A tainted canvas, quota error or old iOS API never hides the image. */}
  finally{finish();}
 };
 // At most one 480px reduction, and only during the browser's idle time.
 if('requestIdleCallback' in window)
  window.requestIdleCallback(()=>{void run();},{timeout:2800});
 else window.setTimeout(()=>{void run();},650);
}
function enqueue(job:Job):()=>void{
 jobs.push(job);
 if(!scheduled&&!working){scheduled=true;window.setTimeout(drain,650);}
 return()=>{job.cancelled=true;};
}
export default function PrivateThumbnail({token,cacheKey,src,alt,className,
 loading='lazy',decoding='async',fallback,onError,expiresAt}:Props){
 const identity=(token||'')+'\u0000'+cacheKey;
 const [cached,setCached]=useState<Prepared|null>(null);
 const [rejected,setRejected]=useState<string|null>(null);
 const [failedRemote,setFailedRemote]=useState<string|null>(null);
 const loaded=useRef<string|null>(null);
 const imageRef=useRef<HTMLImageElement>(null);
 const cancelJobs=useRef<(()=>void)[]>([]);
 useEffect(()=>{
  let live=true,blobUrl='';
  loaded.current=null;
  if(token&&src)void readPrivateImage(token,cacheKey).then(blob=>{
   if(!live||!blob||loaded.current===identity)return;
   blobUrl=URL.createObjectURL(blob);
   setCached({identity,url:blobUrl});
  }).catch(()=>{/* Render remains independent of IndexedDB. */});
  return()=>{
   live=false;
   for(const cancel of cancelJobs.current)cancel();
   cancelJobs.current=[];
   if(blobUrl)URL.revokeObjectURL(blobUrl);
  };
 },[identity]);
 const local=!!cached&&cached.identity===identity&&rejected!==identity;
 const remote=src||'';
 // The remote URL is usable immediately: never await a cache miss to mount it.
 const shown=local&&cached?cached.url:remote;
 const failed=!local&&!!remote&&failedRemote===remote;
 const onLoaded=()=>{
  loaded.current=identity;
  if(local||!token||!src)return;
  const image=imageRef.current;
  if(!image||!image.naturalWidth)return;
  // Saving is OPTIONAL. Never process full-resolution pixels on onLoad.
  const cancel=enqueue({image,token,key:cacheKey,expiresAt:expiresAt??Date.now()+24*60*60*1000,cancelled:false});
  cancelJobs.current.push(cancel);
 };
 const onFailed=()=>{
  if(local){setRejected(identity);return;}
  setFailedRemote(remote);
  onError?.();
 };
 if(!shown||failed)return <>{fallback??null}</>;
 return <img ref={imageRef} className={className} src={shown} alt={alt}
  loading={loading} decoding={decoding}
  crossOrigin={local?undefined:'anonymous'}
  onLoad={onLoaded} onError={onFailed}/>;
}
