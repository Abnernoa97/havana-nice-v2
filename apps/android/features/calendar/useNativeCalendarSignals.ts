import {useEffect,useRef,useState} from 'react';
import {watchNativeCalendar} from '../../services/native-calendar-live';

// One CalendarRoom subscription for the entire authenticated Android session.
// Individual screens receive revision numbers; no duplicate Calendar socket.
export function useNativeCalendarSignals(token?:string){
 const [revision,setRevision]=useState(0);
 const [notice,setNotice]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  setNotice(false);
  if(!token)return;
  const stop=watchNativeCalendar(token,reason=>{
   setRevision(n=>n+1);
   if(reason==='changed'){
    setNotice(true);
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>{setNotice(false);timer.current=null;},5500);
   }
  });
  return()=>{stop();if(timer.current){clearTimeout(timer.current);timer.current=null;}};
 },[token]);
 return {revision,notice,dismiss:()=>setNotice(false)};
}
