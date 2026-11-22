import {useEffect} from 'react';
import {AppState} from 'react-native';
import {Accelerometer} from 'expo-sensors';

const clamp=(value:number)=>Math.max(-8,Math.min(8,value));

// Android's native sensor drives only the decorative vinyl angle and light.
// There is no second audio player, timer or WebSocket, and the subscription
// stops when the screen leaves the foreground or the WebView is removed.
export function useNativeVinylMotion(active:boolean,onTilt:(x:number,y:number)=>void){
 useEffect(()=>{
  if(!active)return;
  let disposed=false;
  let subscription:ReturnType<typeof Accelerometer.addListener>|null=null;
  let baseline:{x:number;y:number}|null=null;
  let smoothX=0,smoothY=0,lastSentX=0,lastSentY=0;
  const stop=()=>{
   subscription?.remove();
   subscription=null;
   baseline=null;
   smoothX=0;smoothY=0;lastSentX=0;lastSentY=0;
   onTilt(0,0);
  };
  const start=async()=>{
   if(disposed||subscription||AppState.currentState!=='active')return;
   try{
    if(!await Accelerometer.isAvailableAsync()||disposed||
      AppState.currentState!=='active')return;
    Accelerometer.setUpdateInterval(80);
    subscription=Accelerometer.addListener(({x,y})=>{
     if(disposed||!Number.isFinite(x)||!Number.isFinite(y))return;
     if(!baseline){baseline={x,y};return;}
     // Relative to the natural portrait holding angle, not the horizon.
     const targetX=clamp(-(y-baseline.y)*20);
     const targetY=clamp((x-baseline.x)*20);
     smoothX=smoothX*.68+targetX*.32;
     smoothY=smoothY*.68+targetY*.32;
     if(Math.abs(smoothX-lastSentX)<.15&&Math.abs(smoothY-lastSentY)<.15)return;
     lastSentX=smoothX;lastSentY=smoothY;
     onTilt(smoothX,smoothY);
    });
   }catch{/* Missing/disabled sensor: normal playback and artwork remain usable. */}
  };
  const appState=AppState.addEventListener('change',state=>{
   if(state==='active')void start();
   else stop();
  });
  void start();
  return()=>{disposed=true;appState.remove();stop();};
 },[active,onTilt]);
}
