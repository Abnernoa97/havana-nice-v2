// The story photo is separate from the 512x512 permanent member avatar.
export async function prepareStoryPhoto(input:File):Promise<Blob>{
 if(!input.type.startsWith('image/'))throw new Error('Elige una fotografía para el estado.');
 if(input.size>25*1024*1024)throw new Error('La fotografía original es demasiado grande.');
 const url=URL.createObjectURL(input);
 try{
  const img=new Image();
  img.src=url;
  await img.decode();
  if(!img.naturalWidth||!img.naturalHeight)throw new Error('No se pudo leer la foto.');
  const canvas=document.createElement('canvas');
  canvas.width=720;canvas.height=1280;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('No se pudo preparar la fotografía.');
  // Preserve the entire picture, including landscape images, on a dark stage.
  ctx.fillStyle='#111814';ctx.fillRect(0,0,720,1280);
  const scale=Math.min(720/img.naturalWidth,1280/img.naturalHeight);
  const w=img.naturalWidth*scale,h=img.naturalHeight*scale;
  ctx.drawImage(img,(720-w)/2,(1280-h)/2,w,h);
  const photo=await new Promise<Blob>((resolve,reject)=>{
   canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo preparar el estado.')),'image/jpeg',0.78);
  });
  if(!photo.size||photo.size>1_500_000)throw new Error('La imagen supera 1.5 MB.');
  return photo;
 }finally{URL.revokeObjectURL(url);}
}
