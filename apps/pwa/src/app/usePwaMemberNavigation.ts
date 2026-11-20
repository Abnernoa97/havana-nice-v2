import {useCallback,useEffect,useRef,useState} from 'react';
import {parsePwaReaderHash,type MemberScreen,type PwaReaderTarget} from '@havana/shared';

// HOME, Chat history and reader hash have a single browser navigation owner.
// Navigating away only dismisses transient Chat UI; sessions and media survive.
export function usePwaMemberNavigation({onChatExit}:{onChatExit:()=>void}){
  const resetChatUi=useRef(onChatExit);
  resetChatUi.current=onChatExit;
  // Existing approved ChatSession is the APP access; HOME adds no login or storage.
  // Only member navigation owns the screen. Camera and unsent photos cannot redirect HOME.
  const [activeScreen,setActiveScreen]=useState<MemberScreen>('home');
  const previousScreen=useRef<MemberScreen>('home');
  // Reset stale Chat history on a normal launch; keep a real camera recovery.
  useEffect(()=>{
    if(activeScreen==='home'&&window.history.state?.hnChatNavigation)
      window.history.replaceState({...window.history.state,hnChatNavigation:false},'',window.location.href);
  },[]);
  const edgeSwipeStart=useRef<{x:number;y:number}|null>(null);
  const navigateTo=useCallback((target:MemberScreen)=>{
    if(target!=='chat'){resetChatUi.current();}
    if(target==='chat'&&activeScreen!=='chat'){
      previousScreen.current=activeScreen;
      window.history.replaceState({...window.history.state,hnChatNavigation:false},'',window.location.href);
      window.history.pushState({...window.history.state,hnChatNavigation:true},'',window.location.href);
    }
    setActiveScreen(target);
  },[activeScreen]);
  const closeChat=()=>{
    resetChatUi.current();
    setActiveScreen(previousScreen.current);
    if(window.history.state?.hnChatNavigation)window.history.back();
  };
  useEffect(()=>{
    const syncBack=()=>{
      if(window.history.state?.hnChatNavigation)setActiveScreen('chat');
      else setActiveScreen(current=>current==='chat'?previousScreen.current:current);
    };
    window.addEventListener('popstate',syncBack);
    return()=>window.removeEventListener('popstate',syncBack);
  },[]);
  const [readerRoute,setReaderRoute]=useState<PwaReaderTarget|null>(
    ()=>parsePwaReaderHash(window.location.hash));
  useEffect(()=>{
    const sync=()=>{
      const route=parsePwaReaderHash(window.location.hash);
      setReaderRoute(route);
      if(route)setActiveScreen('home');
    };
    window.addEventListener('hashchange',sync);
    return()=>window.removeEventListener('hashchange',sync);
  },[]);
  const closeReader=()=>{
    window.history.replaceState(null,'',window.location.pathname+window.location.search);
    setReaderRoute(null);setActiveScreen('home');
  };
  return {activeScreen,setActiveScreen,readerRoute,closeReader,navigateTo,closeChat,edgeSwipeStart};
}
