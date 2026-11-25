// Optional private JPEG derivative. Only sender upload or explicit owner repair
// may instantiate a native thumbnail extractor; timeline reads never do.
import {File} from 'expo-file-system';
import {nativePut} from './native-chat-binary-upload';
import {createVideoPlayer} from 'expo-video';
import {ImageManipulator,SaveFormat} from 'expo-image-manipulator';
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';

const MAX_BYTES=256*1024;
let extracting=false;
function remove(file:File|null){try{if(file?.exists)file.delete();}catch{}}
function release(ref:{release:()=>void}|null){try{ref?.release();}catch{}}

async function extractJpeg(uri:string,signal:AbortSignal):Promise<File|null>{
 // A timed-out native job may still be finishing; never spawn a second decoder.
 if(extracting||signal.aborted)return null;
 extracting=true;
 let player:ReturnType<typeof createVideoPlayer>|null=null;
 let thumbnail:Awaited<ReturnType<ReturnType<typeof createVideoPlayer>['generateThumbnailsAsync']>>[number]|null=null;
 let context:ReturnType<typeof ImageManipulator.manipulate>|null=null;
 let rendered:Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>>|null=null;
 let jpeg:File|null=null;
 try{
  player=createVideoPlayer({uri});player.muted=true;
  const frames=await player.generateThumbnailsAsync([0],{maxWidth:640,maxHeight:640});
  thumbnail=frames[0]??null;
  if(!thumbnail||signal.aborted)return null;
  context=ImageManipulator.manipulate(thumbnail);
  rendered=await context.renderAsync();
  if(signal.aborted)return null;
  const output=await rendered.saveAsync({format:SaveFormat.JPEG,compress:.72});
  jpeg=new File(output.uri);
  if(signal.aborted||!jpeg.exists||jpeg.size<3||jpeg.size>MAX_BYTES)return null;
  const result=jpeg;jpeg=null;return result;
 }catch{return null;}
 finally{remove(jpeg);release(rendered);release(context);release(thumbnail);release(player);extracting=false;}
}

export async function publishNativeVideoPoster(token:string,id:string,uri:string,timeoutMs=4500,ownerSignal?:AbortSignal):Promise<boolean>{
 const ctl=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 const onAbort=()=>ctl.abort();
 if(ownerSignal?.aborted)return false;
 ownerSignal?.addEventListener('abort',onAbort,{once:true});
 const interrupted=new Promise<boolean>(resolve=>{
  ctl.signal.addEventListener('abort',()=>resolve(false),{once:true});
  timer=setTimeout(()=>ctl.abort(),timeoutMs);
 });
 const work=async()=>{
  let file:File|null=null;
  try{
   file=await extractJpeg(uri,ctl.signal);
   if(!file||ctl.signal.aborted)return false;
   await nativePut(file,API+'/api/chat/media/'+encodeURIComponent(id)+'/poster',token,'image/jpeg',undefined,ctl.signal);
   return !ctl.signal.aborted;
  }catch{return false;}finally{remove(file);}
 };
 try{return await Promise.race([work(),interrupted]);}
 finally{if(timer!==undefined)clearTimeout(timer);ownerSignal?.removeEventListener('abort',onAbort);}
}
