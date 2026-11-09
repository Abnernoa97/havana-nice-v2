import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react';

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
   if(stickToLatest.current)scrollChatToLatest();
 },[messageCount,active]);

 useEffect(()=>{
   if(!active)return;
   const list=bottomRef.current?.closest('.chat-messages') as HTMLElement|null;
   const content=list?.querySelector('.chat-message-content');
   if(!list||!content)return;
   const gap=()=>list.scrollHeight-list.scrollTop-list.clientHeight;
   const onScroll=()=>{
     if(gap()<=64)stickToLatest.current=true;
     else if(userScrollGesture.current)stickToLatest.current=false;
   };
   const onTouchMove=()=>{userScrollGesture.current=true;};
   const onTouchEnd=()=>{
     requestAnimationFrame(()=>{userScrollGesture.current=false;});
   };
   const onWheel=()=>{
     userScrollGesture.current=true;
     requestAnimationFrame(()=>{onScroll();userScrollGesture.current=false;});
   };
   const onKeyDown=(event:KeyboardEvent)=>{
     if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key)){
       userScrollGesture.current=true;
       requestAnimationFrame(()=>{onScroll();userScrollGesture.current=false;});
     }
   };
   list.addEventListener('scroll',onScroll,{passive:true});
   list.addEventListener('touchmove',onTouchMove,{passive:true});
   list.addEventListener('touchend',onTouchEnd,{passive:true});
   list.addEventListener('touchcancel',onTouchEnd,{passive:true});
   list.addEventListener('wheel',onWheel,{passive:true});
   list.addEventListener('keydown',onKeyDown);
   // Watch both actual message content (late photos/videos) and available
   // viewport (keyboard/composer height). Do not chase manual history reading.
   const observer=new ResizeObserver(()=>{
     if(stickToLatest.current)scrollChatToLatest();
   });
   observer.observe(content);
   observer.observe(list);
   if(stickToLatest.current)scrollChatToLatest();
   return()=>{
     observer.disconnect();
     list.removeEventListener('scroll',onScroll);
     list.removeEventListener('touchmove',onTouchMove);
     list.removeEventListener('touchend',onTouchEnd);
     list.removeEventListener('touchcancel',onTouchEnd);
     list.removeEventListener('wheel',onWheel);
     list.removeEventListener('keydown',onKeyDown);
   };
 },[active,sessionToken]);
}
