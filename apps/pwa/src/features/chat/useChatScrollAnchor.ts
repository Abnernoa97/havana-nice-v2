import {useCallback,useEffect,useLayoutEffect,useRef,type RefObject} from 'react';

// Owns only scroll positioning. No Chat socket, storage, messages or media API.
// Attaches DOM observers only when the conversation is visible.
type ChatScrollAnchorOptions={
 active:boolean;
 sessionToken?:string;
 messageCount:number;
 bottomRef:RefObject<HTMLDivElement|null>;
 skipOlderRef:RefObject<boolean>;
};

export function useChatScrollAnchor({
 active,sessionToken,messageCount,bottomRef,skipOlderRef,
}:ChatScrollAnchorOptions){
 const chatWasVisible=useRef(false);
 const stickToLatest=useRef(true);
 const userScrollGesture=useRef(false);
 const explicitlyBrowsing=useRef(false);
 // Browsing an older window must never trigger automatic bottom snapping.
 const pauseFollow=useCallback(()=>{explicitlyBrowsing.current=true;stickToLatest.current=false;},[]);
 const resumeLatest=useCallback(()=>{
   explicitlyBrowsing.current=false;
   stickToLatest.current=true;
   userScrollGesture.current=false;
   requestAnimationFrame(()=>{
     const list=bottomRef.current?.closest('.chat-messages') as HTMLElement|null;
     if(list)list.scrollTop=Math.max(0,list.scrollHeight-list.clientHeight);
   });
 },[bottomRef]);
 const scrollChatToLatest=()=>{
   const list=bottomRef.current?.closest('.chat-messages') as HTMLElement|null;
   if(list)list.scrollTop=Math.max(0,list.scrollHeight-list.clientHeight);
 };

 useLayoutEffect(()=>{
   if(!active){
     chatWasVisible.current=false;
     return;
   }
   if(!chatWasVisible.current){
     chatWasVisible.current=true;
     stickToLatest.current=true;
     explicitlyBrowsing.current=false;
     userScrollGesture.current=false;
     scrollChatToLatest();
     // Safari may report a hidden room's previous dimensions on first paint.
     const frame=requestAnimationFrame(scrollChatToLatest);
     return()=>cancelAnimationFrame(frame);
   }
 },[active,sessionToken]);

 useLayoutEffect(()=>{
   if(!active)return;
   // Pagination prepends older messages without yanking a reader to the bottom.
   if(skipOlderRef.current){skipOlderRef.current=false;return;}
   if(stickToLatest.current&&!userScrollGesture.current)scrollChatToLatest();
 },[messageCount,active]);

 useEffect(()=>{
   if(!active)return;
   const list=bottomRef.current?.closest('.chat-messages') as HTMLElement|null;
   const content=list?.querySelector('.chat-message-content');
   if(!list||!content)return;
   const gap=()=>list.scrollHeight-list.scrollTop-list.clientHeight;
   let touchActive=false;
   let settleTimer:ReturnType<typeof setTimeout>|null=null;
   const settle=()=>{
     if(settleTimer!==null)clearTimeout(settleTimer);
     if(touchActive)return;
     // WebKit momentum continues after touchend. Every scroll event resets
     // this timer, so auto-follow cannot snap during the inertial glide.
     settleTimer=setTimeout(()=>{
       settleTimer=null;
       userScrollGesture.current=false;
       if(!explicitlyBrowsing.current&&gap()<=24)stickToLatest.current=true;
     },420);
   };
   const onScroll=()=>{
     if(explicitlyBrowsing.current)return;
     if(userScrollGesture.current){
       stickToLatest.current=false;
       if(!touchActive)settle();
     }else if(gap()<=24)stickToLatest.current=true;
   };
   const onTouchStart=()=>{
     touchActive=true;
     userScrollGesture.current=true;
     stickToLatest.current=false;
     if(settleTimer!==null)clearTimeout(settleTimer);
     settleTimer=null;
   };
   const onTouchMove=()=>{
     userScrollGesture.current=true;
     stickToLatest.current=false;
   };
   const onTouchEnd=()=>{touchActive=false;settle();};
   const onWheel=()=>{
     userScrollGesture.current=true;
     stickToLatest.current=false;
     settle();
   };
   const onKeyDown=(event:KeyboardEvent)=>{
     if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)){
       userScrollGesture.current=true;
       stickToLatest.current=false;
       settle();
     }
   };
   list.addEventListener('scroll',onScroll,{passive:true});
   list.addEventListener('touchstart',onTouchStart,{passive:true});
   list.addEventListener('touchmove',onTouchMove,{passive:true});
   list.addEventListener('touchend',onTouchEnd,{passive:true});
   list.addEventListener('touchcancel',onTouchEnd,{passive:true});
   list.addEventListener('wheel',onWheel,{passive:true});
   list.addEventListener('keydown',onKeyDown);
   // Media loads must not force a bottom snap during a finger movement.
   const observer=new ResizeObserver(()=>{
     if(stickToLatest.current&&!userScrollGesture.current&&!touchActive)
       scrollChatToLatest();
   });
   observer.observe(content);
   observer.observe(list);
   if(stickToLatest.current)scrollChatToLatest();
   return()=>{
     observer.disconnect();
     if(settleTimer!==null)clearTimeout(settleTimer);
     list.removeEventListener('scroll',onScroll);
     list.removeEventListener('touchstart',onTouchStart);
     list.removeEventListener('touchmove',onTouchMove);
     list.removeEventListener('touchend',onTouchEnd);
     list.removeEventListener('touchcancel',onTouchEnd);
     list.removeEventListener('wheel',onWheel);
     list.removeEventListener('keydown',onKeyDown);
   };
 },[active,sessionToken]);
 return {pauseFollow,resumeLatest};
}
