// HAVANA NICE Chat PWA · lightweight on-device photo encoding BEFORE R2.
// Preserve the decoded pixel dimensions and aspect ratio. No remote conversion,
// WASM codec, second upload, EXIF copy or original stored in R2 when optimized.
export const CHAT_PHOTO_COMPRESS_MIN_BYTES=350*1024;
export const CHAT_PHOTO_COMPRESS_MIN_SAVINGS=0.12;
export const CHAT_PHOTO_COMPRESS_MAX_PIXELS=22_000_000;
const MAX_SOURCE_BYTES=32*1024*1024;

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
 * No pixel downscaling: geometry stays identical to the decoded source.
 */
export async function optimizeChatPhotoUpload(file:File):Promise<File>{
 if(file.size<CHAT_PHOTO_COMPRESS_MIN_BYTES||file.size>MAX_SOURCE_BYTES||
   !file.type.startsWith('image/'))return file;
 let decoded:Decoded|null=null;
 try{
  decoded=await decode(file);
  const {width,height}=decoded;
  if(!width||!height||width*height>CHAT_PHOTO_COMPRESS_MAX_PIXELS)return file;
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  try{
   const context=canvas.getContext('2d');
   if(!context)return file;
   context.drawImage(decoded.source,0,0,width,height);
   const webp=await encode(canvas,'image/webp',file.type==='image/png'?0.88:0.82);
   if(webp&&chatPhotoCompressionWorthIt(file.size,webp.size)){
    return new File([webp],file.name.replace(/\.[^.]+$/,'')+'.webp',{
     type:'image/webp',lastModified:file.lastModified,
    });
   }
   // Never remove transparency from PNG, or re-encode a more efficient WebP.
   if(file.type==='image/png'||file.type==='image/webp')return file;
   const jpeg=await encode(canvas,'image/jpeg',0.8);
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
