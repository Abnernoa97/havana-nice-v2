import {useCallback,useEffect,useRef,useState} from 'react';
import {deleteMyStory,getMemberStories,uploadMyStoriesBatch,STORY_BATCH_MAX,type MemberStory} from '@havana/shared';
import {prepareStoryPhoto} from './prepareStoryPhoto';

// HOME-only story controller: no Chat connection, no profile mutation, no storage owner.
export function useMemberStories(token:string|undefined,refreshVersion:number){
 const [stories,setStories]=useState<MemberStory[]>([]);
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const [preparing,setPreparing]=useState(0);
 const requestId=useRef(0);
 const retryIds=useRef(new Set<string>());
 // Server mints a fresh 10-minute R2 photo grant on EACH team refresh.
 // Reactions trigger Family invalidation, but the actual photo never changed.
 // Pin that photo URL for eight minutes so ❤️/👏/😂 never repaint the canvas.
 const photoGrants=useRef(new Map<string,{url:string;issuedAt:number;createdAt:number;expiresAt:number}>());
 const previousToken=useRef(token);
 if(previousToken.current!==token){
  previousToken.current=token;
  photoGrants.current.clear();
  retryIds.current.clear();
 }
 // A different musician session must not show the previous user's photo data.
 useEffect(()=>{setStories([]);setError('');},[token]);
 const refresh=useCallback(async()=>{
  if(!token){setStories([]);return;}
  const id=++requestId.current;
  try{
   const items=await getMemberStories(token);
   if(id!==requestId.current)return;
   const now=Date.now(),validIds=new Set(items.map(s=>s.id));
   for(const oldId of photoGrants.current.keys()){
    if(!validIds.has(oldId))photoGrants.current.delete(oldId);
   }
   const stable=items.map(story=>{
    const saved=photoGrants.current.get(story.id);
    if(saved&&saved.createdAt===story.createdAt&&saved.expiresAt===story.expiresAt&&
     now-saved.issuedAt<8*60*1000)
     return {...story,photoUrl:saved.url};
    photoGrants.current.set(story.id,{
     url:story.photoUrl,issuedAt:now,createdAt:story.createdAt,expiresAt:story.expiresAt
    });
    return story;
   });
   setStories(stable);setError('');
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
  // Backstop when the realtime Familia socket is interrupted or a story was
  // published from Android while this iPhone page stayed open.
  const fallback=window.setInterval(()=>{
   if(!document.hidden&&navigator.onLine)void refresh();
  },45_000);
  return()=>{++requestId.current;window.clearInterval(fallback);
   window.removeEventListener('online',resume);
   document.removeEventListener('visibilitychange',resume);};
 },[refresh,refreshVersion]);
 useEffect(()=>{
  if(!stories.length)return;
  const next=Math.min(...stories.map(s=>s.expiresAt));
  const delay=Math.max(50,Math.min(next-Date.now()+50,2_147_483_000));
  const timer=setTimeout(()=>{setStories(prev=>prev.filter(s=>s.expiresAt>Date.now()));void refresh();},delay);
  return()=>clearTimeout(timer);
 },[stories,refresh]);
 const publish=useCallback(async(files:readonly File[])=>{
  if(!token||saving)return false;
  if(files.length<1||files.length>STORY_BATCH_MAX){
   setError('Selecciona entre 1 y 5 fotografías.');return false;
  }
  setSaving(true);setError('');setPreparing(0);
  try{
   // Sequential local image preparation avoids decoding five huge iPhone photos at once.
   const images:Blob[]=[];
   for(const file of files){
    images.push(await prepareStoryPhoto(file));
    setPreparing(images.length);
   }
   await uploadMyStoriesBatch(token,images);
   await refresh();return true;
  }catch(e){
   setError(e instanceof Error?e.message:'No se pudieron publicar los estados.');return false;
  }finally{setSaving(false);setPreparing(0);}
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
  retryIds.current.add(id);
  // Invalid or expired grant: allow the next GET to mint a replacement.
  photoGrants.current.delete(id);
  void refresh();
 },[refresh]);
 return {stories,error,saving,preparing,publish,remove,retryPhoto,refresh,clearError:()=>setError('')};
}
