import {useEffect,useRef,useState,type ReactNode} from 'react';
import {readPrivateImage,storePrivateImage} from '../../services/private-image-cache';

type Props={
 token:string|undefined;cacheKey:string;src:string|null|undefined;alt:string;
 className?:string;loading?:'eager'|'lazy';decoding?:'async'|'sync'|'auto';
 fallback?:ReactNode;onError?:()=>void;expiresAt?:number;
};
// A previously viewed miniature decrypts on the iPhone before any R2 fetch.
// First-view JPEGs still render normally; compression/storage runs AFTER onLoad.
export default function PrivateThumbnail({token,cacheKey,src,alt,className,
 loading='lazy',decoding='async',fallback,onError,expiresAt}:Props){
 const [display,setDisplay]=useState<{id:string;url:string;local:boolean}|null>(null);
 const identity=(token||'')+'\u0000'+cacheKey;
 const liveUrl=useRef<string|null>(null);
 const imageRef=useRef<HTMLImageElement>(null);
 useEffect(()=>{
  let live=true;
  // Keep the already visible picture while the grant is renewed.
  if(!src||!token){setDisplay(null);return;}
  void readPrivateImage(token,cacheKey).then(blob=>{
   if(!live)return;
   if(blob){
    const url=URL.createObjectURL(blob);
    liveUrl.current=url;
    setDisplay({id:identity,url,local:true});
   }else setDisplay({id:identity,url:src,local:false});
  }).catch(()=>{if(live)setDisplay({id:identity,url:src,local:false});});
  return()=>{live=false;
   // Allow the old image to remain decoded during transition, but release
   // object URLs after consumers have navigated away.
   const url=liveUrl.current;liveUrl.current=null;
   if(url)URL.revokeObjectURL(url);
  };
 },[token,cacheKey,src,identity]);
 const shown=display?.id===identity?display:null;
 const persist=()=>{
  if(!shown||shown.local||!token)return;
  const image=imageRef.current;if(!image||!image.naturalWidth||!image.naturalHeight)return;
  try{
   const scale=Math.min(1,480/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
   const ctx=canvas.getContext('2d');if(!ctx)return;
   ctx.drawImage(image,0,0,canvas.width,canvas.height);
   canvas.toBlob(blob=>{
    if(blob)void storePrivateImage(token,cacheKey,blob,expiresAt??Date.now()+24*60*60*1000);
   },'image/jpeg',0.73);
  }catch{/* Private original still displays if iOS cannot compress it. */}
 };
 if(!shown?.url)return <>{fallback??null}</>;
 return <img ref={imageRef} className={className} src={shown.url} alt={alt}
  loading={loading} decoding={decoding} crossOrigin={shown.local?undefined:'anonymous'}
  onLoad={persist} onError={onError}/>;
}
