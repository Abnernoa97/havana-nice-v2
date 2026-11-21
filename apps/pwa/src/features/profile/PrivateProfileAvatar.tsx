import {useState} from 'react';

// A photo failure must never show Safari's broken-image glyph.
// A new short-lived grant URL automatically unlocks another image attempt.
type Props={photoUrl:string|null|undefined;name:string;fallbackClassName?:string;
 onImageFailure?:()=>void};
export default function PrivateProfileAvatar({photoUrl,name,fallbackClassName,onImageFailure}:Props){
 const [failedUrl,setFailedUrl]=useState<string|null>(null);
 if(photoUrl&&photoUrl!==failedUrl){
  return <img src={photoUrl} alt="" decoding="async" onError={()=>{
   setFailedUrl(photoUrl);
   onImageFailure?.();
  }}/>;
 }
 return <span className={fallbackClassName}>{name.trim().slice(0,1).toUpperCase()||'H'}</span>;
}
