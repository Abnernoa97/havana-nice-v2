import {readPrivateImage,storePrivateImage} from '../../services/private-image-cache';
// Keep only a tiny in-memory copy of each PRIVATE cover while Audio is open.
// iOS system artwork is fetched over a signed, same-origin HTTPS URL, never a
// Blob or base64 URL. No canvas conversions or public R2 objects.
export type PreparedAudioCover={display:string};
export async function prepareAudioCover(url:string,signal:AbortSignal,token?:string,trackId?:string):Promise<PreparedAudioCover>{
 const key=trackId?'audio-cover:'+trackId:'';
 const saved=key?await readPrivateImage(token,key):null;
 const response=saved?null:await fetch(url,{signal,mode:'cors',credentials:'omit',cache:'no-store'});
 if(response&&!response.ok)throw new Error('Portada temporalmente no disponible');
 const blob=saved||await response!.blob();
 if(!blob.type.startsWith('image/')||blob.size>700*1024)
  throw new Error('Formato de portada inesperado');
 const display=URL.createObjectURL(blob);
 try{
  const image=new Image();
  image.decoding='async';image.src=display;
  if(image.decode)await image.decode();
  else await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();image.onerror=()=>reject(new Error('Portada inválida'));
  });
  if(signal.aborted||!image.naturalWidth||!image.naturalHeight)
   throw new Error('Fotografía inválida o carga cancelada');
  if(!saved&&key)void storePrivateImage(token,key,blob,Date.now()+24*60*60*1000);
  return {display};
 }catch(error){
  URL.revokeObjectURL(display);
  throw error;
 }
}
