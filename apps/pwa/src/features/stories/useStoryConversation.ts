import {useCallback,useEffect,useRef,useState} from 'react';
import {getStoryConversation,reactToStory,sendStoryText,sendStoryVoice,
 type StoryConversation,type StoryEmoji} from '@havana/shared';

// One 24h conversation per story ID. Uses authenticated HTTP and the existing
// HOME/Familia invalidation only; NEVER a second Chat WebSocket or Chat storage.
export function useStoryConversation(token:string,storyId:string,refreshVersion:number){
 const [conversation,setConversation]=useState<StoryConversation|null>(null);
 const [error,setError]=useState('');
 const [sending,setSending]=useState(false);
 const serial=useRef(0);
 const refresh=useCallback(async()=>{
  if(!token||!storyId){setConversation(null);return;}
  const id=++serial.current;
  try{
   const next=await getStoryConversation(token,storyId);
   if(id!==serial.current)return;
   setConversation(next);setError('');
  }catch(e){
   if(id!==serial.current)return;
   setError(e instanceof Error?e.message:'Conversación no disponible.');
  }
 },[token,storyId]);
 useEffect(()=>{
  setConversation(null);
  void refresh();
  return()=>{++serial.current;};
 },[refresh,refreshVersion]);
 const postText=useCallback(async(text:string)=>{
  if(sending)return false;
  setSending(true);
  try{await sendStoryText(token,storyId,text);await refresh();return true;}
  catch(e){setError(e instanceof Error?e.message:'No se pudo enviar.');return false;}
  finally{setSending(false);}
 },[token,storyId,sending,refresh]);
 const postVoice=useCallback(async(blob:Blob)=>{
  if(sending)return false;
  setSending(true);
  try{await sendStoryVoice(token,storyId,blob);await refresh();return true;}
  catch(e){setError(e instanceof Error?e.message:'No se pudo enviar el audio.');return false;}
  finally{setSending(false);}
 },[token,storyId,sending,refresh]);
 const react=useCallback(async(emoji:StoryEmoji)=>{
  try{await reactToStory(token,storyId,emoji);await refresh();}
  catch(e){setError(e instanceof Error?e.message:'No se pudo reaccionar.');}
 },[token,storyId,refresh]);
 return {conversation,error,sending,postText,postVoice,react,refresh};
}
