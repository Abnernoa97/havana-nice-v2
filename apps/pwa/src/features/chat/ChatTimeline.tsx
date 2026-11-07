import type {RefObject} from 'react';
import {
 lastReadByOther,messageDeliveryLabel,
 type ChatMessage,type ChatReaction,type ChatReadReceipt,type ChatEmoji
} from '@havana/shared';
import SwipeMessage,{type MessageAnchor} from './SwipeMessage';
import ChatMediaView from './ChatMediaView';

// Presentation only. Authentication, WebSocket, history and offline outbox stay in App.tsx.
type ChatTimelineProps={
 messages:ChatMessage[];
 searchResults:ChatMessage[]|null;
 actorId:string;
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
 messages,searchResults,actorId,token,reactions,receipts,hasMore,loadingOlder,
 onLoadOlder,onReply,onMessageLongPress,onRetry,bottomRef,
}:ChatTimelineProps){
 return (
          <section className="chat-messages" aria-label="Mensajes">
            {searchResults===null&&hasMore&&<button type="button" className="load-older" disabled={loadingOlder}
              onClick={()=>void onLoadOlder()}>{loadingOlder?'Cargando…':'Cargar mensajes anteriores'}</button>}
            {searchResults!==null&&<p className="search-count">{searchResults.length} resultado(s) en historial</p>}
            {messages.length === 0 && <p className="empty-chat">¡Hola! Escribe el primer mensaje.</p>}
            {(searchResults??messages).filter(message=>!message.deletedAt).map(message => {
              const mine = message.senderId === actorId;
              return <SwipeMessage className={mine?'bubble mine':'bubble theirs'}
                key={message.senderId+':'+message.clientMessageId}
                onSwipeRight={()=>onReply(message)}
                onLongPress={anchor=>onMessageLongPress(message,anchor)}>
                {!mine&&<span className="sender">{message.senderName}</span>}
                {message.replyToSeq&&<div className="reply-original">
                  ↪ {messages.find(m=>m.seq===message.replyToSeq)?.text.slice(0,70)||'Mensaje anterior'}
                </div>}
                {!message.media&&<div>{message.text}</div>}
                 {message.media&&<ChatMediaView media={message.media} token={token}/>}
                {message.seq>0&&!message.deletedAt&&reactions.some(r=>r.messageSeq===message.seq)&&
                  <div className="reaction-counts">
                    {(['❤️','😂','👍'] as ChatEmoji[])
                      .filter(emoji=>reactions.some(r=>r.messageSeq===message.seq&&r.emoji===emoji))
                      .map(emoji=><span key={emoji}>{emoji}{reactions.filter(r=>r.messageSeq===message.seq&&r.emoji===emoji).length}</span>)}
                  </div>}
                <span className="message-meta">
                  {new Date(message.sentAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                  {message.editedAt&&!message.deletedAt?' · editado':''}
                  {mine?' · '+messageDeliveryLabel(message):''}
                  {mine&&!message.pending&&lastReadByOther(receipts,actorId)>=message.seq?' · leído':''}
                </span>
                {mine&&message.pending&&message.deliveryStatus==='error'&&
                  <button type="button" className="retry-message"
                    onClick={()=>onRetry(message.clientMessageId)}>Reintentar envío</button>}
              </SwipeMessage>;
            })}
            <div ref={bottomRef} />
          </section>
 );
}
