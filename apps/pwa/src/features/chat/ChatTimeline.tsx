import {memo,useEffect,useLayoutEffect,useMemo,useRef,useState,type RefObject,type UIEvent,type KeyboardEvent,type TouchEvent,type WheelEvent} from 'react';
import {
 buildChatDisplayIndex,messageDeliveryLabel,
 type ChatMessage,type ChatReaction,type ChatReadReceipt
} from '@havana/shared';
import SwipeMessage,{type MessageAnchor} from './SwipeMessage';
import ChatMediaView from './ChatMediaView';
import {CHAT_MESSAGE_WINDOW_SIZE,CHAT_MESSAGE_WINDOW_STEP,chatWindowKey,selectChatMessageWindow,previousChatWindowEnd,nextChatWindowEnd,chatWindowEdgeAction} from './chat-message-window';

// Presentation only. Authentication, WebSocket, history and offline outbox stay in App.tsx.
type ChatTimelineProps={
 messages:ChatMessage[];
 latestMessageRequest:number;
 actorId:string;
 onlineActorIds:ReadonlySet<string>;
 connected:boolean;
 token:string;
 reactions:ChatReaction[];
 receipts:ChatReadReceipt[];
 hasMore:boolean;
 loadingOlder:boolean;
 onLoadOlder:()=>void;
 onBrowseOlder:()=>void;
 onReturnLatest:()=>void;
 onReply:(message:ChatMessage)=>void;
 onMessageLongPress:(message:ChatMessage,anchor:MessageAnchor)=>void;
 onRetry:(clientMessageId:string)=>void;
 bottomRef:RefObject<HTMLDivElement|null>;
};

function ChatTimeline({
 messages,latestMessageRequest,actorId,onlineActorIds,connected,token,reactions,receipts,hasMore,loadingOlder,
 onLoadOlder,onBrowseOlder,onReturnLatest,onReply,onMessageLongPress,onRetry,bottomRef,
}:ChatTimelineProps){
 const display=useMemo(()=>buildChatDisplayIndex(messages,reactions,receipts,actorId),
  [messages,reactions,receipts,actorId]);
 const [endAnchorKey,setEndAnchorKey]=useState<string|null>(null);
 const windowed=useMemo(()=>selectChatMessageWindow(messages,endAnchorKey),
  [messages,endAnchorKey]);
 const pendingPosition=useRef<{key:string;offset:number}|null>(null);
 const lastScrollTop=useRef(0);
 const recentGesture=useRef(0);
 const gestureDirection=useRef<-1|0|1>(0);
 const lastTouchY=useRef<number|null>(null);
 const nextWindowAllowedAt=useRef(0);
 const touchActive=useRef(false);
 const pendingDirection=useRef<-1|0|1>(0);
 const scrollIdleTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>()=>{if(scrollIdleTimer.current!==null)clearTimeout(scrollIdleTimer.current);},[]);
 // Preserve the same on-screen message when the bounded view moves backward,
 // including after asynchronous server pagination prepends older messages.
 const preserveVisibleMessage=()=>{
   const list=bottomRef.current?.closest('.chat-messages') as HTMLElement|null;
   if(!list)return;
   const top=list.getBoundingClientRect().top;
   const row=Array.from(list.querySelectorAll<HTMLElement>('[data-chat-row-key]'))
     .find(element=>element.getBoundingClientRect().bottom>top+8);
   if(row?.dataset.chatRowKey)pendingPosition.current={
     key:row.dataset.chatRowKey,
     offset:row.getBoundingClientRect().top-top,
   };
 };
 useLayoutEffect(()=>{
   const snapshot=pendingPosition.current;
   if(!snapshot)return;
   const list=bottomRef.current?.closest('.chat-messages') as HTMLElement|null;
   const row=Array.from(list?.querySelectorAll<HTMLElement>('[data-chat-row-key]')??[])
     .find(element=>element.dataset.chatRowKey===snapshot.key);
   if(row&&list){
     const offset=row.getBoundingClientRect().top-list.getBoundingClientRect().top;
     list.scrollTop+=offset-snapshot.offset;
   }
   pendingPosition.current=null;
 },[windowed.start,windowed.end,windowed.rows[0]?.clientMessageId]);
 const showOlder=()=>{
   if(loadingOlder)return;
   onBrowseOlder();
   preserveVisibleMessage();
   if(windowed.hasOlder){
     const nextEnd=previousChatWindowEnd(windowed.start,windowed.end);
     setEndAnchorKey(chatWindowKey(windowed.rows[nextEnd-windowed.start-1]));
   }else if(hasMore){
     // Pre-position on the oldest loaded rows. A server page then becomes
     // immediately visible, rather than requiring a second "Ver anteriores" tap.
     const overlap=windowed.rows[Math.min(windowed.rows.length-1,CHAT_MESSAGE_WINDOW_SIZE-CHAT_MESSAGE_WINDOW_STEP-1)];
     if(overlap)setEndAnchorKey(chatWindowKey(overlap));
     onLoadOlder();
   }
 };
 const showNext=()=>{
   onBrowseOlder();
   preserveVisibleMessage();
   const nextEnd=nextChatWindowEnd(windowed.end,windowed.total);
   // Enter the newest window without jumping to the very bottom. Follow-live
   // resumes only when the reader actually reaches the bottom or requests it.
   const nextMessage=messages.filter(item=>!item.deletedAt)[nextEnd-1];
   if(nextMessage)setEndAnchorKey(chatWindowKey(nextMessage));
 };
 const jumpLatest=()=>{
   pendingPosition.current=null;
   setEndAnchorKey(null);
   onReturnLatest();
 };
 // WebKit momentum must finish before changing 24 mounted rows.
 // Switching while the finger is still down fights native iPhone scrolling.
 const settleWindow=(list:HTMLElement)=>{
   if(scrollIdleTimer.current!==null)clearTimeout(scrollIdleTimer.current);
   scrollIdleTimer.current=setTimeout(()=>{
     scrollIdleTimer.current=null;
     if(touchActive.current||!list.isConnected)return;
     const now=Date.now();
     const action=chatWindowEdgeAction({
       scrollTop:list.scrollTop,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,
       direction:pendingDirection.current,
       recentGesture:now-recentGesture.current<1500,
       transitionBlocked:now<nextWindowAllowedAt.current,
       hasOlder:windowed.hasOlder||hasMore,
       hasNewer:windowed.hasNewer,
       loadingOlder,
       readingHistory:endAnchorKey!==null,
     });
     if(!action)return;
     // One window change per gesture. Later layout/anchor corrections are ignored.
     nextWindowAllowedAt.current=now+550;
     gestureDirection.current=0;
     pendingDirection.current=0;
     recentGesture.current=0;
     if(action==='older')showOlder();
     else if(action==='newer')showNext();
     else jumpLatest();
   },180);
 };
 const markTouchStart=(event:TouchEvent<HTMLElement>)=>{
   touchActive.current=true;
   if(scrollIdleTimer.current!==null)clearTimeout(scrollIdleTimer.current);
   scrollIdleTimer.current=null;
   recentGesture.current=Date.now();
   gestureDirection.current=0;
   pendingDirection.current=0;
   lastTouchY.current=event.touches[0]?.clientY??null;
 };
 const markTouchMove=(event:TouchEvent<HTMLElement>)=>{
   const y=event.touches[0]?.clientY;
   if(y===undefined)return;
   recentGesture.current=Date.now();
   if(lastTouchY.current!==null&&Math.abs(y-lastTouchY.current)>1)
     gestureDirection.current=y<lastTouchY.current?1:-1;
   lastTouchY.current=y;
 };
 const markTouchEnd=(event:TouchEvent<HTMLElement>)=>{
   touchActive.current=false;
   recentGesture.current=Date.now();
   lastTouchY.current=null;
   if(gestureDirection.current!==0)settleWindow(event.currentTarget);
 };
 const markTouchCancel=()=>{
   touchActive.current=false;
   gestureDirection.current=0;
   pendingDirection.current=0;
   lastTouchY.current=null;
   if(scrollIdleTimer.current!==null)clearTimeout(scrollIdleTimer.current);
   scrollIdleTimer.current=null;
 };
 const markWheel=(event:WheelEvent<HTMLElement>)=>{
   recentGesture.current=Date.now();
   if(event.deltaY!==0)gestureDirection.current=event.deltaY>0?1:-1;
   settleWindow(event.currentTarget);
 };
 const handleWindowScroll=(event:UIEvent<HTMLElement>)=>{
   const list=event.currentTarget;
   const top=list.scrollTop,delta=top-lastScrollTop.current;
   lastScrollTop.current=top;
   const observedDirection=Math.abs(delta)>1?(delta>0?1:-1):0;
   if(observedDirection!==0)
     pendingDirection.current=observedDirection===gestureDirection.current?observedDirection:0;
   if(!touchActive.current&&gestureDirection.current!==0&&Date.now()-recentGesture.current<1500)
     settleWindow(list);
 };
 const handleWindowKeyDown=(event:KeyboardEvent<HTMLElement>)=>{
   if(['ArrowUp','PageUp','Home'].includes(event.key))gestureDirection.current=-1;
   else if(['ArrowDown','PageDown','End',' '].includes(event.key))gestureDirection.current=1;
   else return;
   recentGesture.current=Date.now();
   settleWindow(event.currentTarget);
 };
 // An outgoing message from the middle of history behaves like WhatsApp:
 // jump back to the latest bubble, rather than hiding the new sent message.
 useLayoutEffect(()=>{
   if(latestMessageRequest===0)return;
   pendingPosition.current=null;
   setEndAnchorKey(null);
   onReturnLatest();
 },[latestMessageRequest,onReturnLatest]);
 return (
          <section className="chat-messages" aria-label="Mensajes"
            onScroll={handleWindowScroll} onTouchStart={markTouchStart}
            onTouchMove={markTouchMove} onTouchEnd={markTouchEnd}
            onTouchCancel={markTouchCancel} onWheel={markWheel} onKeyDown={handleWindowKeyDown}>
            <div className="chat-message-content">
            {(windowed.hasOlder||hasMore)&&<button type="button" className="load-older"
              disabled={loadingOlder} onClick={showOlder}>
              {loadingOlder?'Cargando…':windowed.hasOlder?'Ver mensajes anteriores':'Cargar mensajes anteriores'}
            </button>}
            {messages.length === 0 && <p className="empty-chat">¡Hola! Escribe el primer mensaje.</p>}
            {windowed.rows.map(message => {
              const mine = message.senderId === actorId;
              const badges=display.reactionBadges.get(message.seq)??[];
              return <SwipeMessage className={`bubble ${mine?'mine':'theirs'}${connected&&onlineActorIds.has(message.senderId)?' online':''}`}
                key={message.senderId+':'+message.clientMessageId}
                messageKey={chatWindowKey(message)}
                onSwipeRight={()=>onReply(message)}
                onLongPress={anchor=>onMessageLongPress(message,anchor)}>
                {!mine&&<span className="sender">{message.senderName}</span>}
                {message.replyToSeq&&<div className="reply-original">
                  ↪ {display.replySnippets.get(message.replyToSeq)||'Mensaje anterior'}
                </div>}
                {!message.media&&<div>{message.text}</div>}
                 {message.media&&<ChatMediaView media={message.media} token={token}/>}
                {message.seq>0&&!message.deletedAt&&badges.length>0&&
                  <div className="reaction-counts">
                    {badges.map(({emoji,count})=><span key={emoji}>{emoji}{count}</span>)}
                  </div>}
                <span className="message-meta">
                  {new Date(message.sentAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  {message.editedAt&&!message.deletedAt?' · editado':''}
                  {mine?' · '+messageDeliveryLabel(message):''}
                  {mine&&!message.pending&&display.lastReadByOther>=message.seq?' · leído':''}
                </span>
                {mine&&message.pending&&message.deliveryStatus==='error'&&
                  <button type="button" className="retry-message"
                    onClick={()=>onRetry(message.clientMessageId)}>Reintentar envío</button>}
              </SwipeMessage>;
            })}
            {windowed.hasNewer&&<div className="chat-window-actions">
              <button type="button" onClick={showNext}>Ver mensajes siguientes</button>
              <button type="button" onClick={jumpLatest}>Ir al último ↓</button>
            </div>}
            <div ref={bottomRef} />
            </div>
          </section>
 );
}

// Prevent a keystroke from re-rendering the entire conversation history.
export default memo(ChatTimeline);
