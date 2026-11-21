import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';

// Canonical authorized musician identity; no second account, token or roster.
export type MemberProfile={actorId:string;name:string;photoUrl:string|null};
export class MemberProfileApiError extends Error{
 constructor(message:string,readonly status:number){super(message);this.name='MemberProfileApiError';}
}
export async function getTeamProfiles(token:string,base=API):Promise<MemberProfile[]>{
 const res=await fetch(base+'/api/profile/team',{
  cache:'no-store',headers:{Authorization:'Bearer '+token}
 });
 const data=await res.json().catch(()=>({error:'Servicio de perfiles pendiente.'})) as {profiles?:MemberProfile[];error?:string};
 if(!res.ok)throw new MemberProfileApiError(data.error||'No se pudieron cargar los perfiles.',res.status);
 return (data.profiles||[]).map(profile=>({
  ...profile,
  photoUrl:resolvePrivatePhotoUrl(profile.photoUrl,base),
 }));
}
export async function uploadMyProfilePhoto(
 token:string,file:Blob,base=API
):Promise<void>{
 if(file.type!=='image/jpeg'||!file.size||file.size>1_500_000)
  throw new Error('Elige una fotografía JPG de menos de 1.5 MB.');
 const res=await fetch(base+'/api/profile/me/photo',{
  method:'PUT',cache:'no-store',
  headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg'},
  body:file,
 });
 const data=await res.json() as {error?:string};
 if(!res.ok)throw new MemberProfileApiError(data.error||'No se pudo guardar la fotografía.',res.status);
}

function resolvePrivatePhotoUrl(raw:string|null,base:string):string|null{
 if(typeof raw!=='string')return null;
 try{
  const url=new URL(raw,base);
  if(url.origin!==new URL(base).origin||url.search||url.hash||
    !/^\/api\/profile\/photo\/[a-f0-9]{32}$/.test(url.pathname))return null;
  return url.toString();
 }catch{return null;}
}
