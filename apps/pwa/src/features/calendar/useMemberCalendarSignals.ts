import {useEffect,useRef,useState} from 'react';
import {watchCalendar} from '../../services/calendar-live';
import './calendar-live-notice.css';

// One authenticated CalendarRoom subscription for the entire musician PWA,
// including Chat. Individual screens consume the revision, not another socket.
export function useMemberCalendarSignals(token?:string){
 const [revision,setRevision]=useState(0);
 const [notice,setNotice]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  setNotice(false);
  if(!token)return;
  const stop=watchCalendar(token,false,reason=>{
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
