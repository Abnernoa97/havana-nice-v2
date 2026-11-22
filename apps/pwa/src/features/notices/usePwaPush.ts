import {useCallback,useEffect,useState} from 'react';
import {HAVANA_V2_DEV_API_BASE_URL as API} from '@havana/shared';

// A single browser PushSubscription belongs to this installed PWA. It is
// linked server-side to the EXISTING musician session, never localStorage.
type PushState='checking'|'unavailable'|'pending'|'blocked'|'ready'|'enabled'|'error';
type Config={webReady:boolean;publicKey:string|null;androidReady:boolean};
// Web Push is not available inside Android WebViews. On iPhone the Home
// Screen-installed PWA is required even if Safari exposes partial Push APIs.
function isAppleMobile(){
 if(typeof navigator==='undefined')return false;
 return /iPhone|iPad|iPod/.test(navigator.userAgent)||
  (/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
}
function installedPwa(){
 if(typeof window==='undefined')return false;
 return window.matchMedia?.('(display-mode: standalone)').matches===true||
  (navigator as Navigator&{standalone?:boolean}).standalone===true;
}
const supported=()=>typeof window!=='undefined'&&'serviceWorker' in navigator&&
 'PushManager' in window&&'Notification' in window&&
 (!isAppleMobile()||installedPwa());

export function pwaPushUnavailableMessage():string{
 if(typeof navigator==='undefined')return 'Las notificaciones externas no están disponibles en esta vista.';
 if(isAppleMobile()){
  return installedPwa()?
   'Esta versión del navegador no admite notificaciones Web Push.':
   'En iPhone, abre HAVANA NICE desde su ícono en la pantalla de inicio para activar los avisos.';
 }
 if(/Android/i.test(navigator.userAgent)){
  return 'Esta vista de Android no admite Web Push. Abre HAVANA NICE en Chrome para recibir avisos de la PWA. La APK nativa actual todavía no tiene FCM.';
 }
 return 'Este navegador no admite notificaciones externas. Prueba un navegador compatible.';
}
const keyBytes=(publicKey:string):ArrayBuffer=>{
 const raw=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/')
  .padEnd(Math.ceil(publicKey.length/4)*4,'='));
 return Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;
};
async function config(token:string):Promise<Config>{
 const response=await fetch(API+'/api/push/config',{
  cache:'no-store',headers:{Authorization:'Bearer '+token}});
 if(!response.ok)throw Error('No se pudo comprobar la configuración.');
 return response.json() as Promise<Config>;
}
async function bind(token:string,subscription:PushSubscription){
 const response=await fetch(API+'/api/push/devices',{method:'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({platform:'webpush',subscription:subscription.toJSON()})});
 if(!response.ok)throw Error('No se pudo registrar este teléfono.');
}
export function usePwaPush(token:string){
 const [state,setState]=useState<PushState>('checking');
 const [error,setError]=useState('');
 const [testStatus,setTestStatus]=useState('');
 const [publicKey,setPublicKey]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;setError('');setTestStatus('');setPublicKey(null);setState('checking');
  if(!supported()){setState('unavailable');return()=>{active=false;};}
  void (async()=>{
   try{
    const opts=await config(token);
    if(!active)return;
    if(!opts.webReady||!opts.publicKey){setState('pending');return;}
    setPublicKey(opts.publicKey);
    if(Notification.permission==='denied'){setState('blocked');return;}
    const registration=await navigator.serviceWorker.ready;
    const subscription=await registration.pushManager.getSubscription();
    if(!active)return;
    if(subscription&&Notification.permission==='granted'){
     await bind(token,subscription);
     if(active)setState('enabled');
    }else setState('ready');
   }catch{
    if(active){setState('pending');setError('Configuración push no disponible.');}
   }
  })();
  return()=>{active=false;};
 },[token]);
 const enable=useCallback(async()=>{
  if(!supported()||!publicKey)return;
  // Keep permission request directly inside the user's button gesture;
  // installed iPhone PWAs reject delayed/background permission prompts.
  const ask=Notification.requestPermission();
  setState('checking');setError('');
  try{
   if(await ask!=='granted'){setState('blocked');return;}
   const registration=await navigator.serviceWorker.ready;
   const subscription=await registration.pushManager.getSubscription()||
    await registration.pushManager.subscribe({
     userVisibleOnly:true,applicationServerKey:keyBytes(publicKey)});
   await bind(token,subscription);
   setState('enabled');
  }catch{
   setState('error');setError('No se pudo activar. Comprueba los permisos de notificaciones.');
  }
 },[token,publicKey]);
 const disable=useCallback(async()=>{
  if(!supported())return;
  setError('');
  try{
   const registration=await navigator.serviceWorker.ready;
   const subscription=await registration.pushManager.getSubscription();
   if(subscription){
    const response=await fetch(API+'/api/push/devices',{method:'DELETE',
     headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     body:JSON.stringify({platform:'webpush',endpoint:subscription.endpoint})});
    if(!response.ok)throw Error('No se pudo desvincular');
    await subscription.unsubscribe();
   }
   setState('ready');
  }catch{setError('No se pudieron desactivar las notificaciones.');}
 },[token]);
 const test=useCallback(async()=>{
  setTestStatus('');
  try{
   const reply=await fetch(API+'/api/push/test',{
    method:'POST',headers:{Authorization:'Bearer '+token}
   });
   if(!reply.ok)throw Error('No se pudo programar la prueba.');
   setTestStatus('Prueba programada. Bloquea el teléfono para comprobarla.');
  }catch{setTestStatus('No se pudo programar la prueba. Intenta más tarde.');}
 },[token]);
 return {state,error,enable,disable,test,testStatus};
}
