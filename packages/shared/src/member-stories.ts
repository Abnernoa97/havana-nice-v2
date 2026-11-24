import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';

export const STORY_DURATION_MS=24*60*60*1000;
export const STORY_PLAYBACK_MS=6000;
export const STORY_BATCH_MAX=5;
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
export async function getMemberStories(token:string,base=API,signal?:AbortSignal):Promise<MemberStory[]>{
 const res=await fetch(base+'/api/stories/team',{
  cache:'no-store',headers:{Authorization:'Bearer '+token},...(signal?{signal}:{})
 });
 const data=await res.json().catch(()=>({error:'Estados no disponibles.'})) as {
  error?:string;stories?:MemberStory[];serverNow?:number
 };
 if(!res.ok)throw new MemberStoryApiError(data.error||'No se pudieron cargar los estados.',res.status);
 if(!Array.isArray(data.stories))throw new MemberStoryApiError('La lista de Estados está incompleta.',502);
 const deviceNow=Date.now();
 // The Worker sends authoritative serverNow. A misconfigured Android clock
 // must not silently hide 24-hour states that the server still considers live.
 const serverNow=typeof data.serverNow==='number'&&Number.isFinite(data.serverNow)
  ?data.serverNow:deviceNow;
 const skew=deviceNow-serverNow;
 const adjust= Math.abs(skew)>120_000 ? skew : 0;
 return data.stories.filter(story=>{
  return typeof story?.expiresAt==='number'&&story.expiresAt>serverNow&&
   story.expiresAt>story.createdAt&&
   typeof story.actorId==='string'&&typeof story.id==='string'&&
   privateUrl(story.photoUrl,base)!==null;
 }).map(story=>({...story,photoUrl:privateUrl(story.photoUrl,base)!,
  createdAt:story.createdAt+adjust,expiresAt:story.expiresAt+adjust}));
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
/** One action publishes 1-5 prepared JPEGs atomically to the private story store. */
export async function uploadMyStoriesBatch(token:string,photos:readonly Blob[],base=API):Promise<void>{
 if(!photos.length||photos.length>STORY_BATCH_MAX)
  throw new Error('Selecciona entre 1 y 5 fotografías.');
 for(const photo of photos){
  if(photo.type!=='image/jpeg'||photo.size<4||photo.size>1_500_000)
   throw new Error('Cada foto debe ser JPG y pesar menos de 1.5 MB.');
 }
 const form=new FormData();
 for(let i=0;i<photos.length;i++)form.append('photos',photos[i]!, 'estado-'+(i+1)+'.jpg');
 const res=await fetch(base+'/api/stories/me/batch',{
  method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+token},body:form
 });
 const data=await res.json().catch(()=>({error:'No se pudieron publicar las fotografías.'})) as {error?:string};
 if(!res.ok)throw new MemberStoryApiError(data.error||'No se pudo publicar el lote de estados.',res.status);
}
export async function deleteMyStory(token:string,id:string,base=API):Promise<void>{
 if(!/^[a-f0-9-]{36}$/i.test(id))throw new Error('Estado inválido.');
 const res=await fetch(base+'/api/stories/me/'+id,{
  method:'DELETE',cache:'no-store',headers:{Authorization:'Bearer '+token}
 });
 const data=await res.json().catch(()=>({error:'No se pudo eliminar.'})) as {error?:string};
 if(!res.ok)throw new MemberStoryApiError(data.error||'No se pudo eliminar el estado.',res.status);
}
