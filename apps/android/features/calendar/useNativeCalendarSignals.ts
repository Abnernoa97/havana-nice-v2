import {useEffect,useMemo,useRef,useState} from 'react';
import type {CalendarEvent,RepertoireSong} from '@havana/shared';
import {createNativeModuleLists} from '../shared/native-module-list';
import {watchNativeCalendar} from '../../services/native-calendar-live';

// One CalendarRoom subscription for the entire authenticated Android session.
// Individual screens receive revision numbers; no duplicate Calendar socket.
export function useNativeCalendarSignals(token?:string){
 const lists=useMemo(()=>createNativeModuleLists<CalendarEvent[],RepertoireSong[]>(),[token]);
 const [revision,setRevision]=useState(0);
 const [notice,setNotice]=useState(false);
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{
  setNotice(false);
  if(!token)return;
  const stop=watchNativeCalendar(token,reason=>{
   lists.invalidate();
   setRevision(n=>n+1);
   if(reason==='changed'){
    setNotice(true);
    if(timer.current)clearTimeout(timer.current);
    timer.current=setTimeout(()=>{setNotice(false);timer.current=null;},5500);
   }
  });
  return()=>{stop();lists.invalidate();if(timer.current){clearTimeout(timer.current);timer.current=null;}};
 },[token,lists]);
 return {revision,lists,notice,dismiss:()=>setNotice(false)};
}
