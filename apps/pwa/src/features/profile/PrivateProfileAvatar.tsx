import {useState} from 'react';
import PrivateThumbnail from '../shared/PrivateThumbnail';

// A photo failure must never show Safari's broken-image glyph.
// A new short-lived grant URL automatically unlocks another image attempt.
type Props={photoUrl:string|null|undefined;name:string;fallbackClassName?:string;
 onImageFailure?:()=>void;token?:string;actorId?:string};
export default function PrivateProfileAvatar({photoUrl,name,fallbackClassName,onImageFailure,token,actorId}:Props){
 const [failedUrl,setFailedUrl]=useState<string|null>(null);
 if(photoUrl&&photoUrl!==failedUrl){
  return <PrivateThumbnail token={token} cacheKey={"profile:"+(actorId||name)} src={photoUrl}
   alt="" loading="eager" fallback={<span className={fallbackClassName}>{name.trim().slice(0,1).toUpperCase()||"H"}</span>}
   onError={()=>{setFailedUrl(photoUrl);onImageFailure?.();}}/>;
 }
 return <span className={fallbackClassName}>{name.trim().slice(0,1).toUpperCase()||'H'}</span>;
}
