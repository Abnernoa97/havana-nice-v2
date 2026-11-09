// One purpose: create a high-density inline preview without modifying the
// full-quality original stored in R2. Two decodes at a time keep Safari fluid.
export const CHAT_PREVIEW_LONG_EDGE=1440;
export const CHAT_PREVIEW_JPEG_QUALITY=.92;
export const CHAT_PREVIEW_MAX_ACTIVE=2;

let active=0;
const waiting:Array<()=>void>=[];

async function withPreviewSlot<T>(task:()=>Promise<T>):Promise<T>{
 if(active>=CHAT_PREVIEW_MAX_ACTIVE)
   await new Promise<void>(resolve=>waiting.push(resolve));
 active++;
 try{return await task();}
 finally{active--;waiting.shift()?.();}
}

export function chatPreviewSize(width:number,height:number){
 const ratio=Math.min(1,CHAT_PREVIEW_LONG_EDGE/Math.max(width,height,1));
 return {
   width:Math.max(1,Math.round(width*ratio)),
   height:Math.max(1,Math.round(height*ratio)),
 };
}

function asJpeg(canvas:HTMLCanvasElement):Promise<Blob>{
 return new Promise<Blob>((resolve,reject)=>{
   canvas.toBlob(result=>result?resolve(result):reject(Error('No se pudo preparar la miniatura.')),
     'image/jpeg',CHAT_PREVIEW_JPEG_QUALITY);
 });
}

function drawOnCanvas(source:CanvasImageSource,width:number,height:number):Promise<Blob>{
 const size=chatPreviewSize(width,height);
 const canvas=document.createElement('canvas');
 canvas.width=size.width;canvas.height=size.height;
 const context=canvas.getContext('2d');
 if(!context)throw Error('No se pudo preparar la miniatura.');
 context.imageSmoothingEnabled=true;
 context.imageSmoothingQuality='high';
 context.drawImage(source,0,0,size.width,size.height);
 return asJpeg(canvas);
}

async function previewFromBitmap(original:Blob):Promise<Blob>{
 const bitmap=await createImageBitmap(original);
 try{return await drawOnCanvas(bitmap,bitmap.width,bitmap.height);}
 finally{bitmap.close();}
}

async function previewFromImage(original:Blob):Promise<Blob>{
 const url=URL.createObjectURL(original);
 try{
   const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
     const element=new Image();
     element.onload=()=>resolve(element);
     element.onerror=()=>reject(Error('Imagen no compatible con este navegador.'));
     element.src=url;
   });
   return await drawOnCanvas(image,image.naturalWidth,image.naturalHeight);
 }finally{URL.revokeObjectURL(url);}
}

export async function fetchChatPhotoThumbnail(
 url:string,signal:AbortSignal,
):Promise<Blob>{
 return withPreviewSlot(async()=>{
   if(signal.aborted)throw Error('Descarga cancelada.');
   const response=await fetch(url,{cache:'no-store',signal});
   if(!response.ok)throw Error('Fotografía no disponible.');
   const original=await response.blob();
   if(signal.aborted)throw Error('Descarga cancelada.');
   if(original.type&&!original.type.startsWith('image/'))
     throw Error('Formato de imagen no disponible.');
   try{
     if(typeof createImageBitmap==='function'){
       const preview=await previewFromBitmap(original);
       if(signal.aborted)throw Error('Descarga cancelada.');
       return preview;
     }
   }catch(error){
     if(signal.aborted)throw error;
     // Safari/HEIC can decode through HTMLImageElement but not ImageBitmap.
   }
   const preview=await previewFromImage(original);
   if(signal.aborted)throw Error('Descarga cancelada.');
   return preview;
 });
}
