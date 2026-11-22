// One private, short-lived cover download per track. A locally decoded square
// JPEG gives iOS Media Session real artwork even if the R2 cover is WebP/PNG.
// Never save artwork or media tokens to IndexedDB, storage or a public cache.
export type PreparedAudioCover={display:string;lockscreen:string};
export async function prepareAudioCover(url:string,signal:AbortSignal):Promise<PreparedAudioCover>{
 const response=await fetch(url,{signal,mode:'cors',credentials:'omit',cache:'default'});
 if(!response.ok)throw new Error('Portada temporalmente no disponible');
 const imageData=await response.blob();
 if(!imageData.type.startsWith('image/')||imageData.size>700*1024)
  throw new Error('Formato de portada inesperado');
 const display=URL.createObjectURL(imageData);
 try{
  const img=new Image();
  img.decoding='async';
  img.src=display;
  if(img.decode)await img.decode();
  else await new Promise<void>((resolve,reject)=>{
   img.onload=()=>resolve();img.onerror=()=>reject(new Error('Portada inválida'));
  });
  if(signal.aborted)throw new Error('Carga cancelada');
  const width=img.naturalWidth,height=img.naturalHeight;
  if(!width||!height)throw new Error('Portada sin dimensiones');
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=512;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Imagen no compatible');
  ctx.fillStyle='#f7f0e8';ctx.fillRect(0,0,512,512);
  const scale=Math.max(512/width,512/height);
  ctx.drawImage(img,(512-width*scale)/2,(512-height*scale)/2,width*scale,height*scale);
  return {display,lockscreen:canvas.toDataURL('image/jpeg',.78)};
 }catch(error){
  if(signal.aborted){URL.revokeObjectURL(display);throw error;}
  // Use the working cover as-is if older Safari cannot encode to JPEG.
  return {display,lockscreen:url};
 }
}
