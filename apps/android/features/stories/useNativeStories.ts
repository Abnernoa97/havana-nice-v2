import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {File,UploadType} from 'expo-file-system';
import {deleteMyStory,getMemberStories,type MemberStory,
 HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';

// Native state controller is separate from Chat, Profile, and Family.
export function useNativeStories(token:string,refreshVersion:number){
 const [stories,setStories]=useState<MemberStory[]>([]);
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const latest=useRef(0),mounted=useRef(true);
 const refresh=useCallback(async()=>{
  const seq=++latest.current;
  try{
   const found=await getMemberStories(token);
   if(!mounted.current||latest.current!==seq)return;
   setStories(found);setError('');
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
 const publish=useCallback(async()=>{
  if(saving)return;
  setError('');
  try{
   const permission=await ImagePicker.requestMediaLibraryPermissionsAsync();
   if(!permission.granted)throw Error('Permite el acceso a tus fotografías.');
   const result=await ImagePicker.launchImageLibraryAsync({
    mediaTypes:['images'],allowsMultipleSelection:false,allowsEditing:true,
    aspect:[9,16],quality:0.14
   });
   if(result.canceled||!result.assets.length)return;
   const asset=result.assets[0]!;
   const file=new File(asset.uri);
   if(!file.exists)throw Error('No se pudo abrir la fotografía.');
   if((asset.mimeType||'image/jpeg').toLowerCase()!=='image/jpeg')
    throw Error('Elige una fotografía JPG.');
   if(!file.size||file.size>1_500_000)
    throw Error('La fotografía supera 1.5 MB. Elige otra.');
   setSaving(true);
   const task=file.createUploadTask(API+'/api/stories/me/photo',{
    httpMethod:'PUT',uploadType:UploadType.BINARY_CONTENT,
    headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg','Content-Length':String(file.size)}
   });
   try{
    const reply=await task.uploadAsync();
    if(reply.status<200||reply.status>=300){
     let message='No se pudo publicar el estado.';
     try{message=JSON.parse(reply.body).error||message;}catch{}
     throw Error(message);
    }
   }finally{task.release();}
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo publicar el estado.');}
  finally{setSaving(false);}
 },[token,saving,refresh]);
 const remove=useCallback(async(id:string)=>{
  if(saving)return false;
  setSaving(true);
  try{await deleteMyStory(token,id);setStories(current=>current.filter(st=>st.id!==id));await refresh();return true;}
  catch(e){setError(e instanceof Error?e.message:'No se pudo eliminar.');return false;}
  finally{setSaving(false);}
 },[token,saving,refresh]);
 return {stories:stories.filter(st=>st.expiresAt>Date.now()),error,saving,publish,remove,refresh};
}
