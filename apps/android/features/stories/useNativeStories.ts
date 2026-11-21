import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
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
 const latest=useRef(0),mounted=useRef(true);
 const grants=useRef(new Map<string,{url:string;createdAt:number;expiresAt:number;issuedAt:number}>());
 const retried=useRef(new Set<string>());
 const previousToken=useRef(token);
 if(previousToken.current!==token){
  previousToken.current=token;grants.current.clear();retried.current.clear();
 }
 const refresh=useCallback(async()=>{
  const seq=++latest.current;
  try{
   const found=await getMemberStories(token);
   if(!mounted.current||latest.current!==seq)return;
   // Team reactions invalidate the roster, but an unchanged photo keeps its
   // original 10-minute capability for 8 minutes. Do not re-download R2.
   const now=Date.now(),ids=new Set(found.map(st=>st.id));
   for(const id of grants.current.keys())if(!ids.has(id))grants.current.delete(id);
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
  return()=>{mounted.current=false;++latest.current;sub.remove();};
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
  return f;
 },[]);
 const publish=useCallback(async()=>{
  if(saving)return;
  setError('');
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
    // Stream optimized JPEGs; Android originals remain untouched in the gallery.
    form.append('photos',{uri:file.uri,name:'estado-'+(i+1)+'.jpg',type:'image/jpeg'} as unknown as Blob);
   }
   setSaving(true);
   const reply=await fetch(API+'/api/stories/me/batch',{
    method:'POST',headers:{Authorization:'Bearer '+token},body:form
   });
   const parsed=await reply.json().catch(()=>({error:'No se pudieron publicar los estados.'})) as {error?:string};
   if(!reply.ok)throw Error(parsed.error||'No se pudieron publicar los estados.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'No se pudieron publicar los estados.');}
  finally{setSaving(false);}
 },[token,saving,refresh,prepare]);
 const remove=useCallback(async(id:string)=>{
  if(saving)return false;
  setSaving(true);
  try{await deleteMyStory(token,id);setStories(current=>current.filter(st=>st.id!==id));await refresh();return true;}
  catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar.');return false;}
  finally{setSaving(false);}
 },[token,saving,refresh]);
 const retryPhoto=useCallback((id:string)=>{
  if(!id||retried.current.has(id))return;
  retried.current.add(id);grants.current.delete(id);void refresh();
 },[refresh]);
 return {stories:stories.filter(st=>st.expiresAt>Date.now()),error,saving,publish,remove,refresh,retryPhoto};
}
