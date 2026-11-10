// HAVANA NICE Chat PWA · lightweight on-device photo encoding BEFORE R2.
// Preserve aspect ratio and cap the long edge at 2048px. No remote conversion,
// WASM codec, second upload, EXIF copy or original stored in R2 when optimized.
export const CHAT_PHOTO_COMPRESS_MIN_BYTES=180*1024;
export const CHAT_PHOTO_COMPRESS_MIN_SAVINGS=0.08;
export const CHAT_PHOTO_COMPRESS_MAX_PIXELS=22_000_000;
const MAX_SOURCE_BYTES=32*1024*1024;
export const CHAT_PHOTO_UPLOAD_LONG_EDGE=2048;
export const CHAT_PHOTO_WEBP_QUALITY=0.74;
export const CHAT_PHOTO_JPEG_QUALITY=0.76;
export function chatPhotoUploadDimensions(width:number,height:number){
 const scale=Math.min(1,CHAT_PHOTO_UPLOAD_LONG_EDGE/Math.max(1,width,height));
 return {width:Math.max(1,Math.round(width*scale)),
   height:Math.max(1,Math.round(height*scale))};
}

export function chatPhotoCompressionWorthIt(originalBytes:number,encodedBytes:number):boolean{
 return Number.isFinite(originalBytes)&&Number.isFinite(encodedBytes)&&
   originalBytes>=CHAT_PHOTO_COMPRESS_MIN_BYTES&&encodedBytes>0&&
   encodedBytes<=originalBytes*(1-CHAT_PHOTO_COMPRESS_MIN_SAVINGS);
}

type Decoded={source:CanvasImageSource;width:number;height:number;release:()=>void};
async function decode(file:File):Promise<Decoded>{
 if(typeof createImageBitmap==='function'){
  try{
   const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
   return {source:bitmap,width:bitmap.width,height:bitmap.height,release:()=>bitmap.close()};
  }catch{/* HEIC on Safari may require HTMLImageElement decoding. */}
 }
 const url=URL.createObjectURL(file);
 const image=new Image();
 try{
  image.decoding='async';
  image.src=url;
  await image.decode();
  return {source:image,width:image.naturalWidth,height:image.naturalHeight,
   release:()=>{image.src='';URL.revokeObjectURL(url);}};
 }catch(error){
  URL.revokeObjectURL(url);
  throw error;
 }
}

async function encode(canvas:HTMLCanvasElement,mime:string,quality:number):Promise<Blob|null>{
 return new Promise(resolve=>{
  try{
   canvas.toBlob(blob=>resolve(blob&&blob.type===mime?blob:null),mime,quality);
  }catch{resolve(null);}
 });
}

/** Lossy WebP, or JPEG fallback for opaque photos. Returns the original when
 * already smaller, unsupported by Safari, too big for a safe canvas, or broken.
 * Moderate downscaling keeps chat images sharp without uploading camera originals.
 */
export async function optimizeChatPhotoUpload(file:File):Promise<File>{
 if(file.size<CHAT_PHOTO_COMPRESS_MIN_BYTES||file.size>MAX_SOURCE_BYTES||
   !file.type.startsWith('image/'))return file;
 let decoded:Decoded|null=null;
 try{
  decoded=await decode(file);
  const {width,height}=decoded;
  if(!width||!height||width*height>CHAT_PHOTO_COMPRESS_MAX_PIXELS)return file;
  const target=chatPhotoUploadDimensions(width,height);
  const canvas=document.createElement('canvas');
  canvas.width=target.width;canvas.height=target.height;
  try{
   const context=canvas.getContext('2d');
   if(!context)return file;
   context.imageSmoothingEnabled=true;
   context.imageSmoothingQuality='high';
   context.drawImage(decoded.source,0,0,target.width,target.height);
   const webp=await encode(canvas,'image/webp',CHAT_PHOTO_WEBP_QUALITY);
   if(webp&&chatPhotoCompressionWorthIt(file.size,webp.size)){
    return new File([webp],file.name.replace(/\.[^.]+$/,'')+'.webp',{
     type:'image/webp',lastModified:file.lastModified,
    });
   }
   // Never flatten transparent PNGs or repeatedly re-encode an efficient WebP.
   if(file.type==='image/png'||file.type==='image/webp')return file;
   const jpeg=await encode(canvas,'image/jpeg',CHAT_PHOTO_JPEG_QUALITY);
   if(jpeg&&chatPhotoCompressionWorthIt(file.size,jpeg.size)){
    return new File([jpeg],file.name.replace(/\.[^.]+$/,'')+'.jpg',{
     type:'image/jpeg',lastModified:file.lastModified,
    });
   }
   return file;
  }finally{canvas.width=0;canvas.height=0;}
 }catch{
  // A conversion failure must never stop an authorized Chat upload.
  return file;
 }finally{decoded?.release();}
}
