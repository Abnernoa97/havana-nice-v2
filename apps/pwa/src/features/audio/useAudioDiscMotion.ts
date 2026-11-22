import {useCallback,useEffect,useRef} from 'react';

const clamp=(value:number,limit=8)=>Math.max(-limit,Math.min(limit,value));
const delta=(value:number,start:number)=>((value-start+540)%360)-180;

// Visual-only motion: never touches audio, playlist, media grants or BOOK.
// On iPhone, motion access is requested from the Play/track tap.
export function useAudioDiscMotion(active:boolean){
 const discRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const disc=discRef.current;
  if(!active||!disc||typeof window==='undefined'||!('DeviceOrientationEvent' in window)||
   window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  let start:{beta:number;gamma:number}|null=null;
  let tiltX=0,tiltY=0,lastUpdate=0;
  const handle=(event:DeviceOrientationEvent)=>{
   if(document.hidden||event.beta==null||event.gamma==null)return;
   const now=Date.now();
   if(now-lastUpdate<55)return;
   lastUpdate=now;
   if(!start){start={beta:event.beta,gamma:event.gamma};return;}
   const x=clamp(-delta(event.beta,start.beta)*.3);
   const y=clamp(delta(event.gamma,start.gamma)*.3);
   tiltX=tiltX*.68+x*.32;
   tiltY=tiltY*.68+y*.32;
   if(Math.abs(tiltX)<.1&&Math.abs(tiltY)<.1)return;
   disc.classList.add('hn-motion-active');
   disc.style.setProperty('--hn-disc-x',tiltX.toFixed(2)+'deg');
   disc.style.setProperty('--hn-disc-y',tiltY.toFixed(2)+'deg');
   disc.style.setProperty('--hn-disc-glare-x',(50+tiltY*2.5).toFixed(1)+'%');
   disc.style.setProperty('--hn-disc-glare-y',(35-tiltX*2.4).toFixed(1)+'%');
  };
  window.addEventListener('deviceorientation',handle,{passive:true});
  return()=>{
   window.removeEventListener('deviceorientation',handle);
   disc.classList.remove('hn-motion-active');
   for(const name of ['--hn-disc-x','--hn-disc-y','--hn-disc-glare-x','--hn-disc-glare-y'])
    disc.style.removeProperty(name);
  };
 },[active]);

 const requestFromGesture=useCallback(()=>{
  if(typeof window==='undefined'||!('DeviceOrientationEvent' in window))return;
  const ctor=window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
   requestPermission?:()=>Promise<string>
  };
  // The iOS call must occur directly inside the user's tap, not in an effect.
  try{if(typeof ctor.requestPermission==='function')void ctor.requestPermission().catch(()=>{});}
  catch{/* Denied motion leaves a perfectly normal static record. */}
 },[]);
 return {discRef,requestFromGesture};
}
