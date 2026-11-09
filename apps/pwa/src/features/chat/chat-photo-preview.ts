// Only two Chat originals are decoded at a time; the timeline retains
// small photo thumbnails, never dozens of multi-megabyte full originals.
const MAX_ACTIVE=2;
const MAX_EDGE=420;
let active=0;
const waiting:Array<()=>void>=[];
async function withSlot<T>(task:()=>Promise<T>):Promise<T>{
 if(active>=MAX_ACTIVE)await new Promise<void>(resolve=>waiting.push(resolve));
 active++;
 try{return await task();}
 finally{active--;waiting.shift()?.();}
}
function blobFromCanvas(canvas:HTMLCanvasElement):Promise<Blob>{
 return new Promise<Blob>((resolve,reject)=>{
   canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo crear la miniatura.')),
     'image/jpeg',.78);
 });
}
async function thumbnailFromBitmap(blob:Blob):Promise<Blob>{
 const bitmap=await createImageBitmap(blob);
 try{
   const ratio=Math.min(1,MAX_EDGE/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
   canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
   const context=canvas.getContext('2d');
   if(!context)throw Error('No se pudo preparar la miniatura.');
   context.drawImage(bitmap,0,0,canvas.width,canvas.height);
   return await blobFromCanvas(canvas);
 }finally{bitmap.close();}
}
async function thumbnailFromImage(blob:Blob):Promise<Blob>{
 const url=URL.createObjectURL(blob);
 try{
   const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
     const element=new Image();
     element.onload=()=>resolve(element);
     element.onerror=()=>reject(Error('Imagen no compatible con este navegador.'));
     element.src=url;
   });
   const ratio=Math.min(1,MAX_EDGE/Math.max(image.naturalWidth,image.naturalHeight));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));
   canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
   const context=canvas.getContext('2d');
   if(!context)throw Error('No se pudo preparar la miniatura.');
   context.drawImage(image,0,0,canvas.width,canvas.height);
   return blobFromCanvas(canvas);
 }finally{URL.revokeObjectURL(url);}
}
export function fetchChatPhotoThumbnail(url:string,signal:AbortSignal):Promise<Blob>{
 return withSlot(async()=>{
   if(signal.aborted)throw Error('Descarga cancelada.');
   const response=await fetch(url,{cache:'no-store',signal});
   if(!response.ok)throw Error('Fotografía no disponible.');
   const blob=await response.blob();
   if(signal.aborted)throw Error('Descarga cancelada.');
   if(blob.type&&!blob.type.startsWith('image/'))throw Error('Formato no disponible.');
   try{
     if(typeof createImageBitmap==='function')return await thumbnailFromBitmap(blob);
   }catch{/* On Safari/HEIC, fall back to its native image decoder. */}
   return thumbnailFromImage(blob);
 });
}
