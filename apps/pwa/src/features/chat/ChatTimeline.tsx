import {memo,useLayoutEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {
 buildChatDisplayIndex,messageDeliveryLabel,
 type ChatMessage,type ChatReaction,type ChatReadReceipt
} from '@havana/shared';
import SwipeMessage,{type MessageAnchor} from './SwipeMessage';
import ChatMediaView from './ChatMediaView';
import {chatWindowKey,selectChatMessageWindow,previousChatWindowEnd,nextChatWindowEnd} from './chat-message-window';

// Presentation only. Authentication, WebSocket, history and offline outbox stay in App.tsx.
type ChatTimelineProps={
 messages:ChatMessage[];
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
 messages,actorId,onlineActorIds,connected,token,reactions,receipts,hasMore,loadingOlder,
 onLoadOlder,onBrowseOlder,onReturnLatest,onReply,onMessageLongPress,onRetry,bottomRef,
}:ChatTimelineProps){
 const display=useMemo(()=>buildChatDisplayIndex(messages,reactions,receipts,actorId),
  [messages,reactions,receipts,actorId]);
 const [endAnchorKey,setEndAnchorKey]=useState<string|null>(null);
 const windowed=useMemo(()=>selectChatMessageWindow(messages,endAnchorKey),
  [messages,endAnchorKey]);
 const pendingPosition=useRef<{key:string;offset:number}|null>(null);
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
   }else if(hasMore)onLoadOlder();
 };
 const showNext=()=>{
   onBrowseOlder();
   preserveVisibleMessage();
   const nextEnd=nextChatWindowEnd(windowed.end,windowed.total);
   if(nextEnd===windowed.total){setEndAnchorKey(null);onReturnLatest();}
   else {
     const nextMessage=messages.filter(item=>!item.deletedAt)[nextEnd-1];
     if(nextMessage)setEndAnchorKey(chatWindowKey(nextMessage));
   }
 };
 const jumpLatest=()=>{
   pendingPosition.current=null;
   setEndAnchorKey(null);
   onReturnLatest();
 };
 return (
          <section className="chat-messages" aria-label="Mensajes">
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
