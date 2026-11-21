import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {File,UploadType} from 'expo-file-system';
import {getMusicianDirectory,getTeamProfiles,MemberProfileApiError,
 HAVANA_V2_DEV_API_BASE_URL as API,openFamilyRealtime,FAMILY_WS_HANDSHAKE_TIMEOUT_MS,
 type MemberProfile} from '@havana/shared';

type Phase='checking'|'ready'|'missing'|'legacy'|'offline';
export function useNativeMemberProfile(token:string,actorId:string,watchHome:boolean){
 const [profiles,setProfiles]=useState<MemberProfile[]>([]);
 const [phase,setPhase]=useState<Phase>('checking');
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const [liveVersion,setLiveVersion]=useState(0);
 const request=useRef(0),active=useRef(true);
 const refresh=useCallback(async()=>{
  const id=++request.current;
  try{
   const next=await getTeamProfiles(token);
   if(!active.current||request.current!==id)return;
   setProfiles(next);
   setPhase(next.some(p=>p.actorId===actorId&&p.photoUrl)?'ready':'missing');
   setError('');
  }catch(e){
   if(!active.current||request.current!==id)return;
   if(e instanceof MemberProfileApiError&&e.status===404){
    try{
     const roster=await getMusicianDirectory(token);
     if(active.current&&request.current===id)
      setProfiles(roster.map(p=>({...p,photoUrl:null})));
    }catch{}
    setPhase('legacy');setError('');
   }else{
    setPhase('offline');
    setError('No se pudo consultar el perfil. Puedes seguir usando la aplicación.');
   }
  }
 },[token,actorId]);
 useEffect(()=>{
  active.current=true;setProfiles([]);setPhase('checking');void refresh();
  const subscription=AppState.addEventListener('change',state=>{
   if(state==='active')void refresh();
  });
  return()=>{active.current=false;++request.current;subscription.remove();};
 },[refresh]);
 // One notification-only family socket while HOME is active, never a second Chat.
 useEffect(()=>{
  if(!watchHome)return;
  let alive=true,socket:WebSocket|null=null;
  let retry:ReturnType<typeof setTimeout>|null=null,watchdog:ReturnType<typeof setTimeout>|null=null;
  let delay=1000;
  const clear=()=>{
   if(retry){clearTimeout(retry);retry=null;}
   if(watchdog){clearTimeout(watchdog);watchdog=null;}
  };
  const connect=()=>{
   if(!alive||AppState.currentState!=='active'||socket)return;
   clear();
   try{
    const next=openFamilyRealtime(token,false,event=>{
     if(alive&&socket===next&&(event.type==='family.ready'||event.type==='family.invalidate')){
      void refresh();setLiveVersion(n=>n+1);
     }
    });
    socket=next;
    watchdog=setTimeout(()=>{
     if(!alive||socket!==next||next.readyState===WebSocket.OPEN)return;
     socket=null;try{next.close();}catch{}
     clear();
     if(AppState.currentState==='active'){
      retry=setTimeout(connect,delay);delay=Math.min(12000,delay*2);
     }
    },FAMILY_WS_HANDSHAKE_TIMEOUT_MS);
    next.onopen=()=>{if(socket===next){if(watchdog)clearTimeout(watchdog);watchdog=null;delay=1000;}};
    next.onclose=()=>{if(socket!==next)return;socket=null;clear();
     if(alive&&AppState.currentState==='active'){
      retry=setTimeout(connect,delay);delay=Math.min(12000,delay*2);
     }
    };
    next.onerror=()=>{if(socket===next)next.close();};
   }catch{retry=setTimeout(connect,delay);delay=Math.min(12000,delay*2);}
  };
  const stop=()=>{clear();const previous=socket;socket=null;if(previous)previous.close();};
  connect();
  const sub=AppState.addEventListener('change',state=>{
   if(state==='active'){void refresh();connect();}else stop();
  });
  return()=>{alive=false;stop();sub.remove();};
 },[token,watchHome,refresh]);
 const choosePhoto=useCallback(async()=>{
  if(saving)return;
  setError('');
  try{
   const perm=await ImagePicker.requestMediaLibraryPermissionsAsync();
   if(!perm.granted)throw Error('Permite el acceso a tus fotografías.');
   const result=await ImagePicker.launchImageLibraryAsync({
    mediaTypes:['images'],allowsMultipleSelection:false,allowsEditing:true,
    aspect:[1,1],quality:0.16
   });
   if(result.canceled||!result.assets?.length)return;
   const asset=result.assets[0]!;
   const file=new File(asset.uri);
   if(!file.exists)throw Error('No se pudo abrir la fotografía.');
   const mime=(asset.mimeType||'image/jpeg').toLowerCase();
   if(mime!=='image/jpeg')throw Error('Elige una fotografía JPG para tu perfil.');
   if(!file.size||file.size>1_500_000)throw Error('La foto es demasiado grande. Prueba otra.');
   setSaving(true);
   const task=file.createUploadTask(API+'/api/profile/me/photo',{
    httpMethod:'PUT',uploadType:UploadType.BINARY_CONTENT,
    headers:{Authorization:'Bearer '+token,'Content-Type':'image/jpeg','Content-Length':String(file.size)}
   });
   try{
    const response=await task.uploadAsync();
    if(response.status<200||response.status>=300){
     let message='No se pudo guardar la fotografía.';
     try{message=JSON.parse(response.body).error||message;}catch{}
     throw Error(message);
    }
   }finally{task.release();}
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo seleccionar la foto.');}
  finally{setSaving(false);}
 },[token,saving,refresh]);
 const own=profiles.find(p=>p.actorId===actorId);
 return {profiles,own,phase,error,saving,choosePhoto,refresh,liveVersion};
}
