// One private, short-lived cover download per track, prepared for the in-app
// vinyl/list only. iOS MediaMetadata uses the signed HTTPS URL directly: data:
// artwork was not reliably displayed by the lock-screen process.
// No canvas recompression, persistent storage or extra copy of each image.
export type PreparedAudioCover={display:string};
export async function prepareAudioCover(url:string,signal:AbortSignal):Promise<PreparedAudioCover>{
 const response=await fetch(url,{signal,mode:'cors',credentials:'omit',cache:'default'});
 if(!response.ok)throw new Error('Portada temporalmente no disponible');
 const blob=await response.blob();
 if(!blob.type.startsWith('image/')||blob.size>700*1024)
  throw new Error('Formato de portada inesperado');
 const display=URL.createObjectURL(blob);
 try{
  const image=new Image();
  image.decoding='async';
  image.src=display;
  if(image.decode)await image.decode();
  else await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();image.onerror=()=>reject(new Error('Portada inválida'));
  });
  if(signal.aborted)throw new Error('Carga cancelada');
  if(!image.naturalWidth||!image.naturalHeight)throw new Error('Portada sin dimensiones');
  return {display};
 }catch(error){
  URL.revokeObjectURL(display);
  throw error;
 }
}
