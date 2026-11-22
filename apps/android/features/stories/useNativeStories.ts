import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {File} from 'expo-file-system';
import {deleteMyStory,getMemberStories,STORY_BATCH_MAX,type MemberStory,
 HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';

// Native state controller is separate from Chat, Profile, and Family.
export function useNativeStories(token:string,refreshVersion:number){
 const [stories,setStories]=useState<MemberStory[]>([]);
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const publishing=useRef(false);
 const latest=useRef(0),mounted=useRef(true);
 const grants=useRef(new Map<string,{url:string;createdAt:number;expiresAt:number;issuedAt:number}>());
 // Bounded recovery of expired/failed R2 photo capabilities. Never pin a
 // failed image URL for another eight minutes or retry indefinitely.
 const failedPhotos=useRef(new Map<string,{attempts:number;since:number}>());
 const previousToken=useRef(token);
 if(previousToken.current!==token){
  previousToken.current=token;grants.current.clear();failedPhotos.current.clear();
 }
 const refresh=useCallback(async()=>{
  const seq=++latest.current;
  try{
   const found=await getMemberStories(token);
   if(!mounted.current||latest.current!==seq)return;
   // Team reactions invalidate the roster, but an unchanged photo keeps its
   // original 10-minute capability for 8 minutes. Do not re-download R2.
   const now=Date.now(),ids=new Set(found.map(st=>st.id));
   for(const id of grants.current.keys())if(!ids.has(id)){
    grants.current.delete(id);failedPhotos.current.delete(id);
   }
   const stable=found.map(st=>{
    const old=grants.current.get(st.id);
    if(old&&old.createdAt===st.createdAt&&old.expiresAt===st.expiresAt&&
     now-old.issuedAt<8*60*1000)return {...st,photoUrl:old.url};
    grants.current.set(st.id,{
     url:st.photoUrl,createdAt:st.createdAt,expiresAt:st.expiresAt,issuedAt:now
    });
    return st;
   });
   setStories(stable);setError('');
  }catch(e){
   if(!mounted.current||latest.current!==seq)return;
   setError(e instanceof Error?e.message:'No se pudieron cargar los estados.');
   setStories(current=>current.filter(st=>st.expiresAt>Date.now()));
  }
 },[token]);
 useEffect(()=>{
  mounted.current=true;void refresh();
  const sub=AppState.addEventListener('change',s=>{if(s==='active')void refresh();});
  // Family websocket can be lost on some Android phones while HOME remains
  // visible. A foreground-only reconciliation keeps Android/PWA stories in
  // the same team roster without another socket or constant R2 downloads.
  const fallback=setInterval(()=>{
   if(AppState.currentState==='active')void refresh();
  },45_000);
  return()=>{mounted.current=false;++latest.current;sub.remove();clearInterval(fallback);};
 },[refresh,refreshVersion]);
 useEffect(()=>{
  if(!stories.length)return;
  const next=Math.min(...stories.map(st=>st.expiresAt));
  const timer=setTimeout(()=>{setStories(current=>current.filter(st=>st.expiresAt>Date.now()));void refresh();},
   Math.max(50,Math.min(next-Date.now()+50,2_147_483_000)));
  return()=>clearTimeout(timer);
 },[stories,refresh]);
 const prepare=useCallback(async(uri:string)=>{
  // Android native JPEG/resize: no large original in R2 or JS memory.
  const first=await ImageManipulator.manipulateAsync(uri,[{resize:{width:720}}],{
   compress:.74,format:ImageManipulator.SaveFormat.JPEG
  });
  let result=first;
  if(new File(result.uri).size>450_000){
   result=await ImageManipulator.manipulateAsync(first.uri,[],{
    compress:.54,format:ImageManipulator.SaveFormat.JPEG
   });
  }
  const f=new File(result.uri);
  if(!f.exists||!f.size||f.size>1_500_000)throw Error('Foto demasiado grande después de optimizar.');
  if(f.type!=='image/jpeg')throw Error('No se pudo preparar la fotografía en JPG.');
  return f;
 },[]);
 const publish=useCallback(async()=>{
  // Lock immediately: image picker + JPEG preprocessing are part of the
  // same user action. A second tap must never open another picker/upload.
  if(saving||publishing.current)return;
  publishing.current=true;setSaving(true);setError('');
  try{
   const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
   if(!permission.granted)throw Error('Permite el acceso a tus fotografías.');
   const result=await ImagePicker.launchImageLibraryAsync({
    mediaTypes:['images'],allowsMultipleSelection:true,selectionLimit:STORY_BATCH_MAX,
    orderedSelection:true,quality:0.82
   });
   if(result.canceled||!result.assets.length)return;
   if(result.assets.length>STORY_BATCH_MAX)throw Error('Selecciona máximo cinco fotografías.');
   const form=new FormData();
   for(let i=0;i<result.assets.length;i++){
    const asset=result.assets[i]!;
    const file=await prepare(asset.uri);
    // Expo SDK 58's WinterCG fetch DOES NOT accept a React Native-style
    // {uri,name,type} FormData part. expo-file-system File implements Blob;
    // pass that real file directly so 1-5 photos remain ONE atomic batch.
    form.append('photos',file,'estado-'+(i+1)+'.jpg');
   }
   const reply=await expoFetch(API+'/api/stories/me/batch',{
    method:'POST',headers:{Authorization:'Bearer '+token},body:form
   });
   const parsed=await reply.json().catch(()=>({error:'No se pudieron publicar los estados.'})) as {error?:string};
   if(!reply.ok)throw Error(parsed.error||'No se pudieron publicar los estados.');
   await refresh();
  }catch(e){
   const message=e instanceof Error?e.message:'';
   // Never leak Expo transport internals to the HOME screen.
   setError(/Unsupported FormDataPart|Network request failed/i.test(message)
    ?'No se pudo enviar la foto. Comprueba tu conexión e intenta otra vez.'
    :message||'No se pudieron publicar los estados.');
  }
  finally{publishing.current=false;setSaving(false);}
 },[token,saving,refresh,prepare]);
 const remove=useCallback(async(id:string)=>{
  if(saving)return false;
  setSaving(true);
  try{await deleteMyStory(token,id);setStories(current=>current.filter(st=>st.id!==id));await refresh();return true;}
  catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar.');return false;}
  finally{setSaving(false);}
 },[token,saving,refresh]);
 const retryPhoto=useCallback((id:string)=>{
  if(!id)return;
  const now=Date.now();
  const prior=failedPhotos.current.get(id);
  const recent=prior&&now-prior.since<60_000;
  if(recent&&prior.attempts>=2){
   setError('No se pudo cargar la fotografía. Pulsa Actualizar estados.');
   return;
  }
  failedPhotos.current.set(id,{attempts:recent?prior.attempts+1:1,
   since:recent?prior.since:now});
  // The currently cached grant failed: force a NEW signed URL, even if the
  // eight-minute pin would ordinarily keep the stale one.
  grants.current.delete(id);
  void refresh();
 },[refresh]);
 const retryAll=useCallback(()=>{
  failedPhotos.current.clear();grants.current.clear();
  void refresh();
 },[refresh]);
 return {stories:stories.filter(st=>st.expiresAt>Date.now()),error,saving,publish,remove,refresh,retryPhoto,retryAll};
}
