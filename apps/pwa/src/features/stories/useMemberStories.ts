import {useCallback,useEffect,useRef,useState} from 'react';
import {deleteMyStory,getMemberStories,uploadMyStoriesBatch,STORY_BATCH_MAX,type MemberStory} from '@havana/shared';
import {prepareStoryPhoto} from './prepareStoryPhoto';
import {warmStoryCovers} from './story-photo-pool';

// HOME-only story controller: no Chat connection, no profile mutation, no storage owner.
export function useMemberStories(token:string|undefined,refreshVersion:number){
 const [stories,setStories]=useState<MemberStory[]>([]);
 const [initialReady,setInitialReady]=useState(false);
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const [preparing,setPreparing]=useState(0);
 const requestId=useRef(0);
 const failedPhotos=useRef(new Map<string,{attempts:number;since:number}>());
 // Server mints a fresh 10-minute R2 photo grant on EACH team refresh.
 // Reactions trigger Family invalidation, but the actual photo never changed.
 // Pin that photo URL for eight minutes so ❤️/👏/😂 never repaint the canvas.
 const photoGrants=useRef(new Map<string,{url:string;issuedAt:number;createdAt:number;expiresAt:number}>());
 const previousToken=useRef(token);
 if(previousToken.current!==token){
  previousToken.current=token;
  photoGrants.current.clear();
  failedPhotos.current.clear();
 }
 // The authorized app shell owns the JPEG pool until logout; moving to Chat,
 // Calendario or Repertorio must not flush already displayed status covers.
 useEffect(()=>{setStories([]);setError('');setInitialReady(false);},[token]);
 const refresh=useCallback(async()=>{
  if(!token){setStories([]);setInitialReady(true);return;}
  const id=++requestId.current;
  try{
   const items=await getMemberStories(token);
   if(id!==requestId.current)return;
   const now=Date.now(),validIds=new Set(items.map(s=>s.id));
   for(const oldId of photoGrants.current.keys()){
    if(!validIds.has(oldId)){
     photoGrants.current.delete(oldId);failedPhotos.current.delete(oldId);
    }
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
   warmStoryCovers(stable);
   setStories(stable);setError('');setInitialReady(true);
  }catch(e){
   if(id!==requestId.current)return;
   setInitialReady(true);
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
  if(!id)return;
  const now=Date.now(),prior=failedPhotos.current.get(id);
  const recent=prior&&now-prior.since<60_000;
  if(recent&&prior.attempts>=2){
   setError('No se pudo cargar la fotografía. Pulsa Actualizar estados.');return;
  }
  failedPhotos.current.set(id,{attempts:recent?prior.attempts+1:1,
   since:recent?prior.since:now});
  // Do not retain a failed, privately signed URL during the 8-minute pin.
  photoGrants.current.delete(id);
  void refresh();
 },[refresh]);
 const retryAll=useCallback(()=>{
  failedPhotos.current.clear();photoGrants.current.clear();
  void refresh();
 },[refresh]);
 return {stories,initialReady,error,saving,preparing,publish,remove,retryPhoto,retryAll,
  refresh,clearError:()=>setError('')};
}
