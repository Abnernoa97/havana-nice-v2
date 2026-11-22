// One private cover download per track. The original image is reused in the
// vinyl and list; a small 512x512 JPEG Blob is reserved for iOS Media Session.
// No remote API, persistent image cache, public URL or R2 duplication.
export type PreparedAudioCover={display:string;lockscreen?:string};
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
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height)throw new Error('Portada sin dimensiones');
  // Safari's system artwork should use a square MIME-identified JPEG.
  // This copy never alters the user's actual cover stored in R2.
  let lockscreen:string|undefined;
  try{
   const canvas=document.createElement('canvas');
   canvas.width=512;canvas.height=512;
   const context=canvas.getContext('2d',{alpha:false});
   if(context){
    const side=Math.min(width,height);
    context.fillStyle='#f7f0e8';context.fillRect(0,0,512,512);
    context.drawImage(image,(width-side)/2,(height-side)/2,side,side,0,0,512,512);
    const square=await new Promise<Blob|null>(resolve=>
     canvas.toBlob(resolve,'image/jpeg',0.82));
    if(square?.type==='image/jpeg'&&square.size>0&&square.size<=500*1024)
     lockscreen=URL.createObjectURL(square);
   }
  }catch{/* iOS can use the HTTPS original when canvas export is unavailable. */}
  if(signal.aborted){
   if(lockscreen)URL.revokeObjectURL(lockscreen);
   throw new Error('Carga cancelada');
  }
  return {display,...(lockscreen?{lockscreen}:{})};
 }catch(error){
  URL.revokeObjectURL(display);
  throw error;
 }
}
