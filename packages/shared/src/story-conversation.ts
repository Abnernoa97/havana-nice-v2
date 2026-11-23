import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';

export type StoryEmoji='❤️'|'👏'|'😂';
export type StoryComment={
 id:string;actorId:string;name:string;kind:'text'|'voice';
 text:string;createdAt:number;voiceUrl:string|null;
};
export type StoryReactionDetail={
 actorId:string;name:string;emoji:StoryEmoji;count:number;
};
export type StoryConversation={
 storyId:string;comments:StoryComment[];reactions:Record<StoryEmoji,number>;
 reactionDetails?:StoryReactionDetail[];serverNow:number;
};
const assertId=(id:string)=>{
 if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Estado inválido.');
 return id;
};
const headers=(token:string)=>({Authorization:'Bearer '+token});
async function responseJson<T>(reply:Response):Promise<T>{
 const data=await reply.json().catch(()=>({error:'No disponible'})) as T & {error?:string};
 if(!reply.ok)throw Error(data.error||'No se pudo completar la acción.');
 return data;
}
const voiceUrl=(raw:string|null,base:string)=>{
 if(!raw)return null;
 try{
  const url=new URL(raw,base);
  if(url.origin!==new URL(base).origin||url.hash||url.search||
   !/^\/api\/stories\/voice\/[a-f0-9]{32}$/.test(url.pathname))return null;
  return url.toString();
 }catch{return null;}
};
export async function getStoryConversation(token:string,id:string,base=API):Promise<StoryConversation>{
 const r=await fetch(base+'/api/stories/'+assertId(id)+'/conversation',{
  cache:'no-store',headers:headers(token)
 });
 const data=await responseJson<StoryConversation>(r);
 return {...data,comments:data.comments.map(comment=>({
  ...comment,voiceUrl:voiceUrl(comment.voiceUrl,base)
 }))};
}
export async function sendStoryText(token:string,id:string,text:string,base=API):Promise<void>{
 const cleaned=text.trim();
 if(!cleaned||cleaned.length>500)throw Error('Escribe entre 1 y 500 caracteres.');
 await responseJson(await fetch(base+'/api/stories/'+assertId(id)+'/text',{
  method:'POST',cache:'no-store',headers:{...headers(token),'content-type':'application/json'},
  body:JSON.stringify({text:cleaned})
 }));
}
export async function sendStoryVoice(token:string,id:string,blob:Blob,base=API):Promise<void>{
 if(!['audio/mp4','audio/webm','audio/ogg'].includes(blob.type)||!blob.size||blob.size>3_000_000)
  throw Error('El audio debe pesar menos de 3 MB.');
 await responseJson(await fetch(base+'/api/stories/'+assertId(id)+'/voice',{
  method:'POST',cache:'no-store',headers:{...headers(token),'content-type':blob.type},body:blob
 }));
}
export async function reactToStory(token:string,id:string,emoji:StoryEmoji,base=API):Promise<void>{
 if(emoji!=='❤️'&&emoji!=='👏'&&emoji!=='😂')throw Error('Reacción no admitida.');
 await responseJson(await fetch(base+'/api/stories/'+assertId(id)+'/reaction',{
  method:'POST',cache:'no-store',headers:{...headers(token),'content-type':'application/json'},
  body:JSON.stringify({emoji})
 }));
}
