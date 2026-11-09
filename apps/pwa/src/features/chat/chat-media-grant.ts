// One purpose: exchange a member's authorized session for a short-lived
// media read URL. Never store signed links, tokens or file data.
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
export async function requestChatMediaUrl(
 assetId:string,token:string,signal:AbortSignal,
):Promise<string>{
 const response=await fetch(API+'/api/chat/media/'+encodeURIComponent(assetId)+'/grant',{
   headers:{Authorization:'Bearer '+token},
   cache:'no-store',
   signal,
 });
 if(!response.ok)throw Error('Archivo no disponible.');
 const grant=await response.json() as {url?:unknown};
 if(typeof grant.url!=='string'||!grant.url.startsWith(API+'/api/chat/media/'))
   throw Error('Archivo no disponible.');
 return grant.url;
}
