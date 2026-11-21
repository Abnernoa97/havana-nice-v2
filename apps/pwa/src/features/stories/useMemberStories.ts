import {useCallback,useEffect,useRef,useState} from 'react';
import {deleteMyStory,getMemberStories,uploadMyStory,type MemberStory} from '@havana/shared';
import {prepareStoryPhoto} from './prepareStoryPhoto';

// HOME-only story controller: no Chat connection, no profile mutation, no storage owner.
export function useMemberStories(token:string|undefined,refreshVersion:number){
 const [stories,setStories]=useState<MemberStory[]>([]);
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const requestId=useRef(0);
 const retryIds=useRef(new Set<string>());
 const refresh=useCallback(async()=>{
  if(!token){setStories([]);return;}
  const id=++requestId.current;
  try{
   const items=await getMemberStories(token);
   if(id!==requestId.current)return;
   setStories(items);setError('');
  }catch(e){
   if(id!==requestId.current)return;
   setError(e instanceof Error?e.message:'No se pudieron cargar los estados.');
   setStories(prev=>prev.filter(item=>item.expiresAt>Date.now()));
  }
 },[token]);
 useEffect(()=>{
  void refresh();
  const resume=()=>{if(!document.hidden&&navigator.onLine)void refresh();};
  window.addEventListener('online',resume);
  document.addEventListener('visibilitychange',resume);
  return()=>{++requestId.current;window.removeEventListener('online',resume);
   document.removeEventListener('visibilitychange',resume);};
 },[refresh,refreshVersion]);
 useEffect(()=>{
  if(!stories.length)return;
  const next=Math.min(...stories.map(s=>s.expiresAt));
  const delay=Math.max(50,Math.min(next-Date.now()+50,2_147_483_000));
  const timer=setTimeout(()=>{setStories(prev=>prev.filter(s=>s.expiresAt>Date.now()));void refresh();},delay);
  return()=>clearTimeout(timer);
 },[stories,refresh]);
 const publish=useCallback(async(file:File)=>{
  if(!token||saving)return false;
  setSaving(true);setError('');
  try{
   await uploadMyStory(token,await prepareStoryPhoto(file));
   await refresh();return true;
  }catch(e){setError(e instanceof Error?e.message:'No se pudo publicar.');return false;}
  finally{setSaving(false);}
 },[token,saving,refresh]);
 const remove=useCallback(async(id:string)=>{
  if(!token||saving)return false;
  setSaving(true);
  try{
   await deleteMyStory(token,id);
   setStories(prev=>prev.filter(s=>s.id!==id));await refresh();
   return true;
  }catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar el estado.');return false;}
  finally{setSaving(false);}
 },[token,saving,refresh]);
 const retryPhoto=useCallback((id:string)=>{
  if(!id||retryIds.current.has(id))return;
  retryIds.current.add(id);void refresh();
 },[refresh]);
 return {stories,error,saving,publish,remove,retryPhoto,refresh,clearError:()=>setError('')};
}
