// HAVANA NICE V2 · single, local-only BOOK image optimizer.
//
// The high-quality master is never overwritten or uploaded twice. Only
// a smaller derived WebP is uploaded to the Admin's private R2 endpoint.
// Uses the browser's native decoder/encoder; no paid Cloudflare service,
// no background polling and no duplicate photo-processing engine.
export interface BookOptimizedImage {
 blob:Blob;
 width:number;
 height:number;
 originalBytes:number;
 optimizedBytes:number;
}

const MAX_EDGE=2048;
const MIN_SAVINGS=0.06; // If the source is already efficient, do not store a worse copy.
const WEBP_MIME='image/webp';

function encodedWebp(canvas:HTMLCanvasElement,quality:number):Promise<Blob>{
 return new Promise((resolve,reject)=>{
  canvas.toBlob(result=>{
   if(!result||result.type!==WEBP_MIME)reject(new Error('WebP no está disponible en este dispositivo.'));
   else resolve(result);
  },WEBP_MIME,quality);
 });
}

async function loadImage(blob:Blob):Promise<{
 image:ImageBitmap|HTMLImageElement;width:number;height:number;dispose:()=>void
}>{
 if(typeof createImageBitmap==='function'){
  try{
   const bitmap=await createImageBitmap(blob,{imageOrientation:'from-image'});
   return {image:bitmap,width:bitmap.width,height:bitmap.height,dispose:()=>bitmap.close()};
  }catch{
   // Some iPhone Safari versions can preview HEIC through <img> even when
   // createImageBitmap cannot decode it. Retain the original on failure.
  }
 }
 const objectUrl=URL.createObjectURL(blob);
 try{
  const img=new Image();
  img.decoding='async';
  img.src=objectUrl;
  await img.decode();
  return {image:img,width:img.naturalWidth,height:img.naturalHeight,
   dispose:()=>{img.src='';URL.revokeObjectURL(objectUrl);}};
 }catch(error){
  URL.revokeObjectURL(objectUrl);
  throw new Error('Este teléfono no pudo procesar la fotografía. El original sigue guardado.',{cause:error});
 }
}

/**
 * At most ~4.2 megapixels and typically <1 MB for BOOK pages. The aspect
 * ratio is always preserved; orientation is applied by the browser decoder.
 * If conversion is not meaningfully smaller, return null: original fallback.
 */
export async function optimizeBookPhoto(input:Blob):Promise<BookOptimizedImage|null>{
 if(!input.size||input.size>15*1024*1024)
  throw new Error('BOOK admite originales de hasta 15 MB.');
 const loaded=await loadImage(input);
 try{
  if(!loaded.width||!loaded.height)throw new Error('La fotografía no tiene dimensiones válidas.');
  const scale=Math.min(1,MAX_EDGE/Math.max(loaded.width,loaded.height));
  const width=Math.max(1,Math.round(loaded.width*scale));
  const height=Math.max(1,Math.round(loaded.height*scale));
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  try{
   const ctx=canvas.getContext('2d',{alpha:false});
   if(!ctx)throw new Error('No se pudo preparar la imagen BOOK.');
   ctx.imageSmoothingEnabled=true;
   ctx.imageSmoothingQuality='high';
   ctx.fillStyle='#f9f6ef';
   ctx.fillRect(0,0,width,height);
   ctx.drawImage(loaded.image,0,0,width,height);
   let best=await encodedWebp(canvas,0.86);
   if(best.size>=input.size*(1-MIN_SAVINGS))best=await encodedWebp(canvas,0.79);
   if(best.size>=input.size*(1-MIN_SAVINGS)||best.size<100||best.size>5*1024*1024)
    return null;
   return {blob:best,width,height,originalBytes:input.size,optimizedBytes:best.size};
  }finally{
   // Release large bitmap memory immediately after upload preparation.
   canvas.width=0;canvas.height=0;
  }
 }finally{loaded.dispose();}
}
