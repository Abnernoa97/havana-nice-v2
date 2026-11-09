// One purpose: receive a short-lived authenticated read URL.
// No persistent credentials or private URLs are stored by this module.
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';
export async function requestNativeChatMediaUrl(
 assetId:string,token:string,signal:AbortSignal
):Promise<string>{
 const response=await fetch(API+'/api/chat/media/'+encodeURIComponent(assetId)+'/grant',{
   headers:{Authorization:'Bearer '+token},signal,
 });
 if(!response.ok)throw Error('Archivo no disponible.');
 const grant=await response.json() as {url?:unknown};
 const url=typeof grant.url==='string'?grant.url:'';
 if(!url.startsWith(API+'/api/chat/media/'))throw Error('Archivo no disponible.');
 return url;
}
