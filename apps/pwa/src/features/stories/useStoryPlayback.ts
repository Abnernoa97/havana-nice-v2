import {useEffect,useRef,useState} from 'react';
import {STORY_PLAYBACK_MS} from '@havana/shared';

// One JS timekeeper for every frame. It does not depend on CSS animation events,
// which Safari may suppress or restart when a photo changes or the keyboard opens.
export function useStoryPlayback(storyId:string|undefined,paused:boolean,onComplete:()=>void){
 const [progress,setProgress]=useState(0);
 const elapsed=useRef(0);
 const latest=useRef(onComplete);
 const previous=useRef<number|null>(null);
 useEffect(()=>{latest.current=onComplete;},[onComplete]);
 useEffect(()=>{
  elapsed.current=0;previous.current=null;setProgress(0);
 },[storyId]);
 useEffect(()=>{
  previous.current=null;
  if(!storyId||paused)return;
  let timer:ReturnType<typeof setTimeout>|null=null;
  let active=true;
  const tick=()=>{
   if(!active)return;
   const now=performance.now();
   if(previous.current!==null)elapsed.current=Math.min(STORY_PLAYBACK_MS,elapsed.current+now-previous.current);
   previous.current=now;
   setProgress(100*elapsed.current/STORY_PLAYBACK_MS);
   if(elapsed.current>=STORY_PLAYBACK_MS){
    active=false;previous.current=null;latest.current();
   }else timer=setTimeout(tick,48);
  };
  timer=setTimeout(tick,48);
  return()=>{active=false;if(timer!==null)clearTimeout(timer);previous.current=null;};
 },[storyId,paused]);
 return progress;
}
