import {useEffect,useRef,useState} from 'react';

// iPhone Safari changes the VISUAL viewport when the keyboard rises.
// Freeze the story photo height; move only its compact composer above the keyboard.
// No page-wide resize/zoom listeners and no BOOK/Chat gesture interference.
export function useStoryKeyboardViewport(){
 const initial=useRef<number>(
  typeof window==='undefined'?800:Math.round(window.visualViewport?.height||window.innerHeight)
 );
 const [keyboardInset,setKeyboardInset]=useState(0);
 useEffect(()=>{
  const viewport=window.visualViewport;
  if(!viewport)return;
  const update=()=>{
   const active=document.activeElement;
   const typing=active instanceof HTMLElement&&
    active.closest('.hn-story-viewer')!==null&&
    active.matches('input,textarea,[contenteditable="true"]');
   const hidden=initial.current-viewport.height-viewport.offsetTop;
   setKeyboardInset(typing&&hidden>100?Math.max(0,Math.round(hidden)):0);
  };
  viewport.addEventListener('resize',update);
  viewport.addEventListener('scroll',update);
  document.addEventListener('focusin',update);
  document.addEventListener('focusout',update);
  return()=>{
   viewport.removeEventListener('resize',update);
   viewport.removeEventListener('scroll',update);
   document.removeEventListener('focusin',update);
   document.removeEventListener('focusout',update);
  };
 },[]);
 return {fixedHeight:initial.current,keyboardInset};
}
