import {useMemo,type RefObject} from 'react';
import {
 buildChatDisplayIndex,messageDeliveryLabel,
 type ChatMessage,type ChatReaction,type ChatReadReceipt
} from '@havana/shared';
import SwipeMessage,{type MessageAnchor} from './SwipeMessage';
import ChatMediaView from './ChatMediaView';

// Presentation only. Authentication, WebSocket, history and offline outbox stay in App.tsx.
type ChatTimelineProps={
 messages:ChatMessage[];
 searchResults:ChatMessage[]|null;
 actorId:string;
 onlineActorIds:ReadonlySet<string>;
 connected:boolean;
 token:string;
 reactions:ChatReaction[];
 receipts:ChatReadReceipt[];
 hasMore:boolean;
 loadingOlder:boolean;
 onLoadOlder:()=>void;
 onReply:(message:ChatMessage)=>void;
 onMessageLongPress:(message:ChatMessage,anchor:MessageAnchor)=>void;
 onRetry:(clientMessageId:string)=>void;
 bottomRef:RefObject<HTMLDivElement|null>;
};

export default function ChatTimeline({
 messages,searchResults,actorId,onlineActorIds,connected,token,reactions,receipts,hasMore,loadingOlder,
 onLoadOlder,onReply,onMessageLongPress,onRetry,bottomRef,
}:ChatTimelineProps){
 const display=useMemo(()=>buildChatDisplayIndex(messages,reactions,receipts,actorId),
  [messages,reactions,receipts,actorId]);
 return (
          <section className="chat-messages" aria-label="Mensajes">
            <div className="chat-message-content">
            {searchResults===null&&hasMore&&<button type="button" className="load-older" disabled={loadingOlder}
              onClick={()=>void onLoadOlder()}>{loadingOlder?'Cargando…':'Cargar mensajes anteriores'}</button>}
            {searchResults!==null&&<p className="search-count">{searchResults.length} resultado(s) en historial</p>}
            {messages.length === 0 && <p className="empty-chat">¡Hola! Escribe el primer mensaje.</p>}
            {(searchResults??messages).filter(message=>!message.deletedAt).map(message => {
              const mine = message.senderId === actorId;
              const badges=display.reactionBadges.get(message.seq)??[];
              return <SwipeMessage className={`bubble ${mine?'mine':'theirs'}${connected&&onlineActorIds.has(message.senderId)?' online':''}`}
                key={message.senderId+':'+message.clientMessageId}
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
            <div ref={bottomRef} />
            </div>
          </section>
 );
}
