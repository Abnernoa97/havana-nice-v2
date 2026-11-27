// One native FCM subscriber, mounted by the existing Chat shell.
// No second login, socket, polling service, or persisted private push token.
import {useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Linking,Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import {HAVANA_V2_DEV_API_BASE_URL as API,type MemberScreen} from '@havana/shared';

export const HAVANA_PUSH_CHANNEL='havana-team-activity';
const PUSH_DISABLED_KEY='havana-v2:android-push-disabled';
const REGISTRATION_REFRESH_MS=24*60*60*1000;
const REGISTRATION_RETRY_MS=30_000;
type PushState='checking'|'ready'|'enabled'|'blocked'|'pending'|'unavailable'|'error';
type Config={androidReady:boolean};

Notifications.setNotificationHandler({
 handleNotification:async()=>({
  shouldShowBanner:true,shouldShowList:true,
  shouldPlaySound:true,shouldSetBadge:false,
 })
});

function targetScreen(payload:unknown):MemberScreen{
 const kind=typeof (payload as {kind?:unknown}|null)?.kind==='string'?
  (payload as {kind:string}).kind:'';
 if(kind.startsWith('chat.'))return 'chat';
 if(kind.startsWith('story.')||kind==='profile.photo')return 'home';
 if(kind.startsWith('family.'))return 'family';
 if(kind.startsWith('calendar.'))return 'calendar';
 if(kind.startsWith('repertoire.'))return 'repertoire';
 return 'notices';
}
async function requestPush(token:string,method:'GET'|'POST'|'DELETE',path:string,body?:object){
 const response=await fetch(API+path,{
  method,headers:{Authorization:'Bearer '+token,
   ...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
 });
 if(!response.ok)throw Error('No se pudo conectar con las notificaciones.');
 return response;
}
async function bindFcm(token:string,value:string){
 await requestPush(token,'POST','/api/push/devices',{platform:'android-fcm',token:value});
}
async function revokeFcm(token:string,value:string){
 await requestPush(token,'DELETE','/api/push/devices',{platform:'android-fcm',token:value});
}
async function ensureChannel(){
 await Notifications.setNotificationChannelAsync(HAVANA_PUSH_CHANNEL,{
  name:'Actividad HAVANA NICE',
  description:'Mensajes, Estados, reacciones y novedades del equipo',
  importance:Notifications.AndroidImportance.MAX,
  sound:'default',enableVibrate:true,vibrationPattern:[0,250,150,250],
 });
}
export type NativePushControl={
 state:PushState;error:string;testStatus:string;enable:()=>Promise<void>;
 disable:()=>Promise<void>;test:()=>Promise<void>;openSettings:()=>Promise<void>;
};

export function useNativePush(token:string|null,onNavigate:(screen:MemberScreen)=>void):NativePushControl{
 const [state,setState]=useState<PushState>('checking');
 const [error,setError]=useState('');
 const [testStatus,setTestStatus]=useState('');
 const registered=useRef<{session:string;device:string}|null>(null);
 const navigate=useRef(onNavigate);
 navigate.current=onNavigate;
 const enabledSession=useRef<string|null>(null);
 const liveSession=useRef<string|null>(token);
 liveSession.current=token;
 const optedOut=useRef(false);
 const lastBoundAt=useRef(0);
 const lastAttempt=useRef<{session:string;device:string;at:number}|null>(null);
 const syncTail=useRef<Promise<void>>(Promise.resolve());
 const pendingSync=useRef(new Map<string,Promise<void>>());
 const sync=useCallback((currentToken:string,suppliedCredential?:string,force=false):Promise<void>=>{
  // The SDK can emit a token event while reading it. Never read a token
  // from the listener; accept its credential directly and dedupe by identity.
  if(liveSession.current!==currentToken||optedOut.current)return Promise.resolve();
  const key=JSON.stringify([currentToken,suppliedCredential??null]);
  const pending=pendingSync.current.get(key);if(pending)return pending;
  const work=syncTail.current.catch(()=>{}).then(async()=>{
  if(liveSession.current!==currentToken||optedOut.current)return;
  if(suppliedCredential===undefined)await ensureChannel();
  const credential=suppliedCredential??(await Notifications.getDevicePushTokenAsync()).data;
  if(typeof credential!=='string'||credential.length<32)
   throw Error('Firebase no entregó un identificador válido.');
  // Stop a delayed Firebase callback from re-enrolling a signed-out user.
  if(liveSession.current!==currentToken||optedOut.current)return;
  const known=registered.current;
  if(!force&&known?.session===currentToken&&known.device===credential&&Date.now()-lastBoundAt.current<REGISTRATION_REFRESH_MS){
   enabledSession.current=currentToken;setState('enabled');setError('');return;
  }
  const attempt=lastAttempt.current;
  if(!force&&attempt?.session===currentToken&&attempt.device===credential&&Date.now()-attempt.at<REGISTRATION_RETRY_MS)return;
  lastAttempt.current={session:currentToken,device:credential,at:Date.now()};
  await bindFcm(currentToken,credential);
  if(liveSession.current!==currentToken||optedOut.current){
   await revokeFcm(currentToken,credential).catch(()=>{});
   return;
  }
  const prior=registered.current;
  registered.current={session:currentToken,device:credential};lastBoundAt.current=Date.now();
  enabledSession.current=currentToken;
  setState('enabled');setError('');
  // Revoke the replaced token only after the new token has committed.
  if(prior&&(prior.session!==currentToken||prior.device!==credential))
   await revokeFcm(prior.session,prior.device).catch(()=>{});
  });
  const tracked=work.finally(()=>{if(pendingSync.current.get(key)===tracked)pendingSync.current.delete(key);});
  pendingSync.current.set(key,tracked);syncTail.current=tracked;
  return tracked;
 },[]);
 useEffect(()=>{
  if(Platform.OS!=='android'){setState('unavailable');return;}
  // A restored session is authoritative; close the former device registration
  // if the server owner changed, without disturbing the rest of Chat.
  const prev=registered.current;
  if(prev&&prev.session!==token){
   registered.current=null;enabledSession.current=null;
   void revokeFcm(prev.session,prev.device).catch(()=>{});
  }
  if(!token){
   setTestStatus('');
   optedOut.current=false;
   setState('checking');
   return;
  }
  let active=true;
  void (async()=>{
   try{
    const response=await requestPush(token,'GET','/api/push/config');
    const config=await response.json() as Config;
    if(!active)return;
    if(!config.androidReady){setState('pending');return;}
    optedOut.current=await Storage.getItem(PUSH_DISABLED_KEY)==='1';
    if(optedOut.current){setState('ready');return;}
    const permissions=await Notifications.getPermissionsAsync();
    if(!active)return;
    if(!permissions.granted){
     setState(permissions.canAskAgain===false?'blocked':'ready');return;
    }
    await sync(token);
   }catch{
    if(active){setState('error');setError('No se pudo registrar el teléfono.');}
   }
  })();
  const renewed=Notifications.addPushTokenListener(next=>{
   if(active&&enabledSession.current===token&&typeof next.data==='string'&&
      registered.current?.device!==next.data)
    void sync(token,next.data).catch(()=>{
     if(active)setError('No se pudo actualizar el registro de notificaciones.');
    });
  });
  const onResponse=(response:Notifications.NotificationResponse)=>{
   if(active)navigate.current(targetScreen(response.notification.request.content.data));
  };
  const tapped=Notifications.addNotificationResponseReceivedListener(onResponse);
  void Notifications.getLastNotificationResponseAsync().then(response=>{
   if(active&&response){
    onResponse(response);
    void Notifications.clearLastNotificationResponseAsync().catch(()=>{});
   }
  }).catch(()=>{});
  const foreground=AppState.addEventListener('change',status=>{
   if(!active||status!=='active'||optedOut.current)return;
   void Notifications.getPermissionsAsync().then(permission=>{
    if(!active)return;
    if(permission.granted)void sync(token).catch(()=>{});
    else setState(permission.canAskAgain===false?'blocked':'ready');
   }).catch(()=>{});
  });
  return()=>{
   active=false;renewed.remove();tapped.remove();foreground.remove();
   // A change of screen does NOT unbind; only a changed/revoked session does.
  };
 },[token,sync]);
 const enable=useCallback(async()=>{
  if(!token||Platform.OS!=='android')return;
  setState('checking');setError('');
  try{
   const response=await requestPush(token,'GET','/api/push/config');
   const config=await response.json() as Config;
   if(!config.androidReady){setState('pending');return;}
   await ensureChannel();
   const permissions=await Notifications.getPermissionsAsync();
   const result=permissions.granted?permissions:await Notifications.requestPermissionsAsync();
   if(!result.granted){
    setState(result.canAskAgain===false?'blocked':'ready');return;
   }
   await Storage.removeItem(PUSH_DISABLED_KEY);
   optedOut.current=false;
   await sync(token,undefined,true);
  }catch{
   setState('error');setError('No se pudieron activar los avisos del teléfono.');
  }
 },[token,sync]);
 const disable=useCallback(async()=>{
  const prior=registered.current;
  if(!token||!prior||prior.session!==token)return;
  optedOut.current=true;
  try{
   // Wait for any in-flight bind to settle; prevent a delayed renewal from
   // registering again after the user's explicit opt-out.
   await syncTail.current.catch(()=>{});
   if(liveSession.current!==token)return;
   const latest=registered.current;
   await revokeFcm(token,latest?.session===token?latest.device:prior.device);
   await Storage.setItem(PUSH_DISABLED_KEY,'1');
   registered.current=null;enabledSession.current=null;setError('');setState('ready');
  }catch{if(liveSession.current===token){optedOut.current=false;setError('No se pudo desvincular este teléfono.');}}
 },[token]);
 const test=useCallback(async()=>{
  if(!token||state!=='enabled')return;
  setTestStatus('');
  try{
   await requestPush(token,'POST','/api/push/test');
   setTestStatus('Prueba programada. Bloquea el teléfono para comprobarla.');
  }catch{setTestStatus('No se pudo programar la prueba. Intenta más tarde.');}
 },[token,state]);
 const openSettings=useCallback(async()=>{await Linking.openSettings();},[]);
 return {state,error,testStatus,enable,disable,test,openSettings};
}
