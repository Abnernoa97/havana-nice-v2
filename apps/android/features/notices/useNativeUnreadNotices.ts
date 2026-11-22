import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {getMemberNotices} from '@havana/shared';

// Foreground badge only. Background/locked-screen delivery needs an actual
// FCM push registration and server-side provider; do not mistake this for push.
export function useNativeUnreadNotices(token:string,revision:number){
 const [unread,setUnread]=useState(0);
 useEffect(()=>{
  let live=true;
  const refresh=async()=>{
   if(AppState.currentState!=='active')return;
   try{const inbox=await getMemberNotices(token);
    if(live)setUnread(Math.max(0,Math.min(99,inbox.unread)));
   }catch{/* Preserve last known unread count during outages. */}
  };
  void refresh();
  const listener=AppState.addEventListener('change',state=>{
   if(state==='active')void refresh();
  });
  const fallback=setInterval(()=>{void refresh();},30_000);
  return()=>{live=false;listener.remove();clearInterval(fallback);};
 },[token,revision]);
 return unread;
}
