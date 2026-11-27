// Android Chat only: compress new large selections before their upload UUID
// is committed. No network, no change to the gallery source, no JS video bytes.
import {requireOptionalNativeModule} from 'expo';
import {File,Paths} from 'expo-file-system';
import {Platform} from 'react-native';
import type {PendingNativeChatMedia} from '../../storage/chatPendingMedia';

type Compressor={
 compress:(input:string,output:string,id:string,shortSide:number)=>Promise<number>;
 progress:(id:string)=>Promise<number>;
 cancel:(id:string)=>Promise<void>;
};
const COMPRESS_ABOVE=25*1024*1024;
const FREE_RESERVE=64*1024*1024;
export async function optimizeNativeChatVideo(item:PendingNativeChatMedia,
 dimensions:{width:number;height:number}|undefined,current:()=>boolean,
 onProgress:(percent:number)=>void):Promise<PendingNativeChatMedia>{
 if(Platform.OS!=='android'||item.kind!=='video'||item.sizeBytes<=COMPRESS_ABOVE)return item;
 if(!current())throw Error('Selección cancelada.');
 const native=requireOptionalNativeModule<Compressor>('HavanaVideoCompression');
 if(!native)throw Error('El compresor de video no está disponible en esta instalación.');
 if(Paths.availableDiskSpace<item.sizeBytes+FREE_RESERVE)
  throw Error('No hay espacio suficiente para preparar el video.');
 const output=new File(Paths.document,'hn-v2-chat-pending-'+item.id+'-optimized.mp4');
 const width=dimensions?.width||0,height=dimensions?.height||0;
 const short=Math.min(width,height),long=Math.max(width,height);
 const shortSide=short>0&&long>0?Math.max(2,2*Math.floor(Math.min(720,short,short*1280/long)/2)):720;
 let polling=false,finished=false,keeping=false,last=-2,lastActivity=Date.now();
 let poll:ReturnType<typeof setInterval>|undefined;
 try{
  onProgress(-1);
  const task=native.compress(item.uri,output.uri,item.id,shortSide);
  poll=setInterval(()=>{
   if(finished||polling)return;
   if(!current()||Date.now()-lastActivity>180_000){
    void native.cancel(item.id).catch(()=>{});return;
   }
   polling=true;
   void native.progress(item.id).then(percent=>{
    if(finished||!current())return;
    if(percent!==last){last=percent;lastActivity=Date.now();onProgress(percent);}
   }).catch(()=>{}).finally(()=>{polling=false;});
  },500);
  const size=await task;finished=true;
  if(!current())throw Error('Selección cancelada.');
  if(!output.exists||!Number.isSafeInteger(size)||size<=0||output.size!==size)
   throw Error('El video comprimido quedó incompleto.');
  if(size>=item.sizeBytes*.9)return item; // Do not send a larger or barely smaller file.
  keeping=true;
  return {...item,uri:output.uri,mimeType:'video/mp4',sizeBytes:size,
   name:item.name.replace(/\.[^.]+$/,'').slice(0,175)+'.mp4'};
 }finally{
  finished=true;if(poll!==undefined)clearInterval(poll);
  if(!keeping){try{if(output.exists)output.delete();}catch{}}
 }
}
