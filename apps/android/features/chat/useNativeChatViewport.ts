// Owns native timeline position only. No socket, outbox or authorization.
import {useEffect,useRef} from 'react';
import {type FlatList} from 'react-native';
import type {ChatMessage,MemberScreen} from '@havana/shared';
export type NativeChatScrollEvent={nativeEvent:{
 contentOffset:{y:number};contentSize:{height:number};layoutMeasurement:{height:number}
}};
export function useNativeChatViewport(activeScreen:MemberScreen,sessionToken?:string){
  const scroll=useRef<FlatList<ChatMessage>|null>(null);
  const autoScroll=useRef(true);
  const initialHistoryPending=useRef(true);
  const initialHistoryLoaded=useRef(false);
  const initialBottomTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const initialBottomAttempts = useRef(0);
  const userHasScrolled=useRef(false);
  function scheduleInitialBottom() {
    if (!initialHistoryPending.current || !initialHistoryLoaded.current || userHasScrolled.current) return;
    // FlatList initially measures a virtualized subset of the history.
    // Keep landing on the real last bubble as later cells are measured.
    scroll.current?.scrollToOffset({offset:0,animated:false});
    if (initialBottomTimer.current) clearTimeout(initialBottomTimer.current);
    initialBottomTimer.current = setTimeout(() => {
      initialBottomTimer.current = null;
      if (!initialHistoryPending.current || userHasScrolled.current) return;
      initialBottomAttempts.current+=1;
      scroll.current?.scrollToOffset({offset:0,animated:false});
      if(initialBottomAttempts.current<10)scheduleInitialBottom();
      else initialHistoryPending.current=false;
    }, 120);
  }
  function beginFreshChatViewport() {
    if (initialBottomTimer.current) clearTimeout(initialBottomTimer.current);
    initialBottomTimer.current=null;
    initialHistoryPending.current=true;
    initialHistoryLoaded.current=false;
    initialBottomAttempts.current=0;
    userHasScrolled.current=false;
    autoScroll.current=true;
  }
  // Keep one socket, offline outbox and drafts alive behind HOME. The virtualized
  // message/media surface mounts fresh on entry, anchored to the last bubble.
  useEffect(()=>{
    if(activeScreen!=='chat'||!sessionToken)return;
    userHasScrolled.current=false;
    autoScroll.current=true;
    initialHistoryPending.current=true;
    initialHistoryLoaded.current=true;
    initialBottomAttempts.current=0;
    scheduleInitialBottom();
    return()=>{
      if(initialBottomTimer.current)clearTimeout(initialBottomTimer.current);
      initialBottomTimer.current=null;
    };
  },[activeScreen,sessionToken]);

  function trackUserScroll(event:{nativeEvent:{contentOffset:{y:number};contentSize:{height:number};layoutMeasurement:{height:number}}}) {
    const {contentOffset}=event.nativeEvent;
    // Inverted FlatList keeps the newest bubble at offset 0. Never drag
    // someone back to the bottom while they read older messages above it.
    autoScroll.current=contentOffset.y<90;
  }
  return {scroll,autoScroll,initialHistoryPending,initialHistoryLoaded,
    initialBottomTimer,userHasScrolled,scheduleInitialBottom,beginFreshChatViewport,trackUserScroll};
}
