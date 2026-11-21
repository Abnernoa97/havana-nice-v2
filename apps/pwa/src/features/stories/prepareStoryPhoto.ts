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
  // Fill tall story stage with a dim, blurred copy, never black letterboxing.
  const cover=Math.max(720/img.naturalWidth,1280/img.naturalHeight);
  const bw=img.naturalWidth*cover,bh=img.naturalHeight*cover;
  ctx.save();
  ctx.filter='blur(22px) brightness(0.47)';
  ctx.drawImage(img,(720-bw)/2-30,(1280-bh)/2-30,bw+60,bh+60);
  ctx.restore();
  ctx.fillStyle='rgba(9,18,13,.14)';ctx.fillRect(0,0,720,1280);
  const contain=Math.min(720/img.naturalWidth,1280/img.naturalHeight);
  const w=img.naturalWidth*contain,h=img.naturalHeight*contain;
  ctx.drawImage(img,(720-w)/2,(1280-h)/2,w,h);
  const photo=await new Promise<Blob>((resolve,reject)=>{
   canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo preparar el estado.')),'image/jpeg',0.78);
  });
  if(!photo.size||photo.size>1_500_000)throw new Error('La imagen supera 1.5 MB.');
  return photo;
 }finally{URL.revokeObjectURL(url);}
}
