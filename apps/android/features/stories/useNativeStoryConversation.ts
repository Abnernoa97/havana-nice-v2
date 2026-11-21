import {useCallback,useEffect,useRef,useState} from 'react';
import {File,UploadType} from 'expo-file-system';
import {
 getStoryConversation,reactToStory,sendStoryText,
 HAVANA_V2_DEV_API_BASE_URL as API,
 type StoryConversation,type StoryEmoji,
} from '@havana/shared';

// Authenticated per-photo public team discussion. No Chat socket, no Chat DB.
export function useNativeStoryConversation(token:string,storyId:string,version:number){
 const [conversation,setConversation]=useState<StoryConversation|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const seq=useRef(0),pending=useRef(false);
 const refresh=useCallback(async()=>{
  if(!storyId||!token){setConversation(null);return;}
  const n=++seq.current;
  try{
   const result=await getStoryConversation(token,storyId);
   if(seq.current===n){setConversation(result);setError('');}
  }catch(e){if(seq.current===n)setError(e instanceof Error?e.message:'No se pudo abrir la conversación.');}
 },[token,storyId]);
 useEffect(()=>{
  setConversation(null);void refresh();
  return()=>{++seq.current;};
 },[refresh,version]);
 const action=useCallback(async(job:()=>Promise<void>)=>{
  if(pending.current)return false;
  pending.current=true;setBusy(true);setError('');
  try{await job();await refresh();return true;}
  catch(e){setError(e instanceof Error?e.message:'No se pudo enviar.');return false;}
  finally{pending.current=false;setBusy(false);}
 },[refresh]);
 const text=useCallback((message:string)=>action(()=>sendStoryText(token,storyId,message)),
  [action,token,storyId]);
 const react=useCallback(async(emoji:StoryEmoji)=>{
  setConversation(current=>current?{...current,reactions:{
   ...current.reactions,[emoji]:(current.reactions[emoji]||0)+1
  }}:current);
  try{await reactToStory(token,storyId,emoji);await refresh();}
  catch(e){setError(e instanceof Error?e.message:'No se pudo reaccionar.');void refresh();}
 },[token,storyId,refresh]);
 const voice=useCallback((uri:string)=>action(async()=>{
  const file=new File(uri);
  if(!file.exists||!file.size||file.size>3_000_000)
   throw Error('Audio vacío o mayor de 3 MB.');
  // This is the SAME binary upload API as the PWA, using proven Expo FileSystem.
  const task=file.createUploadTask(API+'/api/stories/'+storyId+'/voice',{
   httpMethod:'POST',uploadType:UploadType.BINARY_CONTENT,
   headers:{Authorization:'Bearer '+token,'Content-Type':'audio/mp4',
    'Content-Length':String(file.size)},
  });
  try{
   const response=await task.uploadAsync();
   if(response.status<200||response.status>=300){
    let message='No se pudo guardar la nota de voz.';
    try{message=JSON.parse(response.body).error||message;}catch{}
    throw Error(message);
   }
  }finally{task.release();}
 }),[action,token,storyId]);
 return {conversation,error,busy,refresh,text,react,voice};
}
