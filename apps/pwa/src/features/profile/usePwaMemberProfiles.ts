import {useCallback,useEffect,useRef,useState} from 'react';
import {getMusicianDirectory,getTeamProfiles,uploadMyProfilePhoto,
 MemberProfileApiError,type MemberProfile} from '@havana/shared';
import {useFamilyLive} from '../../services/use-family-live';

export type ProfilePhase='checking'|'ready'|'missing'|'legacy'|'offline';
export function usePwaMemberProfiles(token:string|undefined,actorId:string|undefined){
 const [profiles,setProfiles]=useState<MemberProfile[]>([]);
 const [phase,setPhase]=useState<ProfilePhase>('checking');
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const request=useRef(0);
 const refresh=useCallback(async()=>{
  if(!token){setPhase('legacy');setProfiles([]);return;}
  const id=++request.current;
  try{
   const found=await getTeamProfiles(token);
   if(id!==request.current)return;
   setProfiles(found);
   setPhase(found.some(p=>p.actorId===actorId&&p.photoUrl)?'ready':'missing');
   setError('');
  }catch(e){
   if(id!==request.current)return;
   // During the separate Worker roll-out, the old roster continues to work.
   // No locked screen or false photo requirement until /api/profile/team exists.
   if(e instanceof MemberProfileApiError&&e.status===404){
    try{
     const directory=await getMusicianDirectory(token);
     if(id!==request.current)return;
     setProfiles(directory.map(p=>({...p,photoUrl:null})));
    }catch{/* keep previously known names */}
    setPhase('legacy');setError('');
   }else{
    setPhase('offline');
    setError('No se pudo consultar el perfil. Puedes seguir usando HAVANA NICE.');
   }
  }
 },[token,actorId]);
 useEffect(()=>{
  setPhase('checking');setProfiles([]);void refresh();
  const resume=()=>{if(!document.hidden&&navigator.onLine)void refresh();};
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume);
  return()=>{++request.current;document.removeEventListener('visibilitychange',resume);
   window.removeEventListener('online',resume);};
 },[refresh]);
 // Live subscription belongs to authorized HOME, never the public preview.
 const upload=useCallback(async(file:File)=>{
  if(!token||saving)return;
  setSaving(true);setError('');
  try{
   const result=await normalizeProfilePhoto(file);
   await uploadMyProfilePhoto(token,result);
   await refresh();
  }catch(e){
   setError(e instanceof Error?e.message:'No se pudo guardar la fotografía.');
  }finally{setSaving(false);}
 },[token,saving,refresh]);
 const own=profiles.find(p=>p.actorId===actorId);
 return {profiles,own,phase,error,saving,upload,refresh};
}
async function normalizeProfilePhoto(file:File):Promise<Blob>{
 if(!file.type.startsWith('image/'))throw new Error('Elige una fotografía.');
 if(file.size>25*1024*1024)throw new Error('La foto original es demasiado grande.');
 const url=URL.createObjectURL(file);
 const image=new Image();
 try{
  image.src=url;await image.decode();
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('No se pudo leer la fotografía.');
  const side=Math.min(image.naturalWidth,image.naturalHeight);
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=512;
  const context=canvas.getContext('2d');
  if(!context)throw new Error('No se pudo preparar la fotografía.');
  context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,512,512);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>{
   if(b)resolve(b);else reject(new Error('No se pudo convertir la fotografía.'));
  },'image/jpeg',0.84));
  if(blob.size>1_500_000)throw new Error('No se pudo reducir el tamaño de la fotografía.');
  return blob;
 }finally{URL.revokeObjectURL(url);}
}

export function PwaProfileLive({token,onChange}:{token:string;onChange:()=>void}){
 useFamilyLive(token,false,onChange);
 return null;
}
