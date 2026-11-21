import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';

export const STORY_DURATION_MS=24*60*60*1000;
export type MemberStory={
 id:string;actorId:string;name:string;
 createdAt:number;expiresAt:number;photoUrl:string;
};
export class MemberStoryApiError extends Error{
 constructor(message:string,readonly status:number){super(message);this.name='MemberStoryApiError';}
}
const privateUrl=(raw:string,base:string)=>{
 try{
  const url=new URL(raw,base);
  if(url.origin!==new URL(base).origin||url.search||url.hash||
   !/^\/api\/stories\/photo\/[a-f0-9]{32}$/.test(url.pathname))return null;
  return url.toString();
 }catch{return null;}
};
export async function getMemberStories(token:string,base=API):Promise<MemberStory[]>{
 const res=await fetch(base+'/api/stories/team',{
  cache:'no-store',headers:{Authorization:'Bearer '+token}
 });
 const data=await res.json().catch(()=>({error:'Estados no disponibles.'})) as {
  error?:string;stories?:MemberStory[]
 };
 if(!res.ok)throw new MemberStoryApiError(data.error||'No se pudieron cargar los estados.',res.status);
 const now=Date.now();
 return (data.stories||[]).filter(story=>{
  return story.expiresAt>now&&story.expiresAt>story.createdAt&&
   typeof story.actorId==='string'&&typeof story.id==='string'&&
   privateUrl(story.photoUrl,base)!==null;
 }).map(story=>({...story,photoUrl:privateUrl(story.photoUrl,base)!}));
}
export async function uploadMyStory(token:string,photo:Blob,base=API):Promise<void>{
 if(photo.type!=='image/jpeg'||photo.size<4||photo.size>1_500_000)
  throw new Error('La foto del estado debe ser JPG y pesar menos de 1.5 MB.');
 const res=await fetch(base+'/api/stories/me/photo',{
  method:'PUT',cache:'no-store',headers:{
   Authorization:'Bearer '+token,'Content-Type':'image/jpeg'
  },body:photo
 });
 const data=await res.json().catch(()=>({error:'No se pudo publicar.'})) as {error?:string};
 if(!res.ok)throw new MemberStoryApiError(data.error||'No se pudo publicar el estado.',res.status);
}
export async function deleteMyStory(token:string,id:string,base=API):Promise<void>{
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Estado inválido.');
 const res=await fetch(base+'/api/stories/me/'+id,{
  method:'DELETE',cache:'no-store',headers:{Authorization:'Bearer '+token}
 });
 const data=await res.json().catch(()=>({error:'No se pudo eliminar.'})) as {error?:string};
 if(!res.ok)throw new MemberStoryApiError(data.error||'No se pudo eliminar el estado.',res.status);
}
