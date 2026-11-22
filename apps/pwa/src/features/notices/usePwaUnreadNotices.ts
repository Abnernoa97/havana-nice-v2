import {useEffect,useState} from 'react';
import {getMemberNotices} from '@havana/shared';

// A badge is part of the existing authenticated PWA shell, not another socket.
// Visibility/focus and the existing Calendar/Family revisions refresh it.
export function usePwaUnreadNotices(token:string|undefined,revision:number){
 const [unread,setUnread]=useState(0);
 useEffect(()=>{
  if(!token){setUnread(0);return;}
  let live=true;
  const refresh=async()=>{
   if(document.hidden||!navigator.onLine)return;
   try{const box=await getMemberNotices(token);
    if(live)setUnread(Math.max(0,Math.min(99,box.unread)));
   }catch{/* A temporary network error must not erase unread counts. */}
  };
  void refresh();
  const onResume=()=>{void refresh();};
  document.addEventListener('visibilitychange',onResume);
  window.addEventListener('focus',onResume);
  window.addEventListener('online',onResume);
  const polling=setInterval(()=>{void refresh();},30_000);
  return()=>{live=false;clearInterval(polling);
   document.removeEventListener('visibilitychange',onResume);
   window.removeEventListener('focus',onResume);
   window.removeEventListener('online',onResume);};
 },[token,revision]);
 return unread;
}
