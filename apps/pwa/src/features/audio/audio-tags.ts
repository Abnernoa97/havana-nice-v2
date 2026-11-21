// Tiny, dependency-free ID3v2 parser. Reads up to 2 MiB, never loads the
// entire MP3 merely to discover embedded art. Supports v2.3 and v2.4 APIC.
// M4A/AAC/FLAC can use an image selected separately in Administration.
export type AudioTags={title:string;artist:string;album:string;cover:Blob|null};
const sync=(a:Uint8Array,o:number)=>((a[o]&127)<<21)|((a[o+1]&127)<<14)|((a[o+2]&127)<<7)|(a[o+3]&127);
const be=(a:Uint8Array,o:number)=>a[o]*0x1000000+(a[o+1]<<16)+(a[o+2]<<8)+a[o+3];
const text=(bytes:Uint8Array,encoding:number)=>{
 try{
  if(encoding===1||encoding===2){
   const little=encoding===1&&(bytes[0]===255&&bytes[1]===254||bytes[0]!==254);
   return new TextDecoder(little?'utf-16le':'utf-16be').decode(bytes).replace(/^\uFEFF/,'').replace(/\u0000/g,'').trim();
  }
  return new TextDecoder(encoding===0?'iso-8859-1':'utf-8').decode(bytes).replace(/\u0000/g,'').trim();
 }catch{return '';}
};
function extractCover(bytes:Uint8Array):Blob|null{
 if(!bytes.length)return null;
 const encoding=bytes[0];
 let p=1;
 while(p<bytes.length&&bytes[p]!==0)p++;
 const mime=new TextDecoder('ascii').decode(bytes.subarray(1,p)).toLowerCase();
 p+=2; // MIME terminator then picture type
 if(p>=bytes.length)return null;
 const wide=encoding===1||encoding===2;
 if(wide){while(p+1<bytes.length&&(bytes[p]!==0||bytes[p+1]!==0))p+=2;p+=2;}
 else {while(p<bytes.length&&bytes[p]!==0)p++;p++;}
 const type=mime==='image/jpeg'||mime==='image/png'||mime==='image/webp'?mime:null;
 if(!type||p>=bytes.length||bytes.length-p>2*1024*1024)return null;
 return new Blob([bytes.subarray(p).slice().buffer],{type});
}
export async function detectAudioTags(file:File):Promise<AudioTags>{
 const info:AudioTags={title:file.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' ').trim(),
  artist:'HAVANA NICE',album:'HAVANA NICE',cover:null};
 if(!/\.(mp3)$/i.test(file.name)&&file.type!=='audio/mpeg')return info;
 const data=new Uint8Array(await file.slice(0,2*1024*1024).arrayBuffer());
 if(data.length<10||String.fromCharCode(...data.subarray(0,3))!=='ID3')return info;
 const major=data[3];if(major!==3&&major!==4)return info;
 const tagSize=Math.min(data.length,10+sync(data,6));
 let i=10;
 while(i+10<=tagSize){
  const name=String.fromCharCode(...data.subarray(i,i+4));
  if(!/^[A-Z0-9]{4}$/.test(name))break;
  const size=major===4?sync(data,i+4):be(data,i+4);
  if(!size||i+10+size>tagSize)break;
  const value=data.subarray(i+10,i+10+size);
  if(name==='TIT2'&&value.length)info.title=text(value.subarray(1),value[0])||info.title;
  if(name==='TPE1'&&value.length)info.artist=text(value.subarray(1),value[0])||info.artist;
  if(name==='TALB'&&value.length)info.album=text(value.subarray(1),value[0])||info.album;
  if(name==='APIC'&&!info.cover)info.cover=extractCover(value);
  i+=10+size;
 }
 return info;
}
export async function compactCover(blob:Blob):Promise<Blob>{
 if(blob.size<=390*1024&&['image/jpeg','image/png','image/webp'].includes(blob.type))return blob;
 const bitmap=await createImageBitmap(blob);
 try{
  const side=600,scale=Math.min(1,side/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Portada no disponible.');
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const converted=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
   result=>result?resolve(result):reject(Error('No se pudo comprimir la portada.')),'image/webp',0.75
  ));
  if(converted.size>400*1024)throw Error('La portada sigue siendo demasiado grande.');
  return converted;
 }finally{bitmap.close();}
}
