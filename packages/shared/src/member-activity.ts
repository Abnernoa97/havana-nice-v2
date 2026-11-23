import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';
import type {MemberScreen} from './memberModules';
export type MemberActivityType='module.open'|'audio.play';
export async function logMemberActivity(token:string,type:MemberActivityType,
 target:MemberScreen|string,platform:'android'|'iphone'):Promise<boolean>{
 if(!token||!target)return false;
 try{
  const res=await fetch(API+'/api/member/activity',{
   method:'POST',cache:'no-store',
   headers:{Authorization:'Bearer '+token,'content-type':'application/json','x-havana-platform':platform},
   body:JSON.stringify({type,target}),
  });
  return res.ok;
 }catch{return false;}
}
