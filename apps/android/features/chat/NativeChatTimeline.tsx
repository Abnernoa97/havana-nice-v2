import React,{useMemo,type RefObject} from 'react';
import {ScrollView,View,Text,Pressable,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {
 buildChatDisplayIndex,messageDeliveryLabel,
 type ChatMessage,type ChatReaction,type ChatReadReceipt,type ChatSession,
} from '@havana/shared';
import SwipeableBubble,{type BubbleAnchor} from './SwipeableBubble';
import NativeChatMediaView from './NativeChatMediaView';
import {styles} from '../../styles/chat-styles';

// Pure timeline: the one App.tsx owns the WebSocket, storage, scroll lifecycle,
// media upload and keyboard behavior. This module only renders existing rows.
type Props={
 messages:ChatMessage[];
 results:ChatMessage[]|null;
 session:ChatSession;
 reactions:ChatReaction[];
 receipts:ChatReadReceipt[];
 hasMore:boolean;
 loadingOlder:boolean;
 scrollRef:RefObject<React.ElementRef<typeof ScrollView>|null>;
 onContentSizeChange:()=>void;
 onLayout:()=>void;
 onScrollBeginDrag:()=>void;
 onScroll:(event:NativeSyntheticEvent<NativeScrollEvent>)=>void;
 onScrollEndDrag:(event:NativeSyntheticEvent<NativeScrollEvent>)=>void;
 onLoadOlder:()=>void;
 onReply:(message:ChatMessage)=>void;
 onMessageLongPress:(message:ChatMessage,anchor:BubbleAnchor)=>void;
 onRetry:(clientMessageId:string)=>void;
};

export default function NativeChatTimeline({
 messages,results,session,reactions,receipts,hasMore,loadingOlder,
 scrollRef,onContentSizeChange,onLayout,onScrollBeginDrag,onScroll,onScrollEndDrag,
 onLoadOlder,onReply,onMessageLongPress,onRetry,
}:Props){
 const display=useMemo(()=>buildChatDisplayIndex(messages,reactions,receipts,session.actorId),
   [messages,reactions,receipts,session.actorId]);
 return (
            <ScrollView
              ref={scrollRef} style={styles.messageList} contentContainerStyle={styles.messages}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={onContentSizeChange}
              onLayout={onLayout}
              onScrollBeginDrag={onScrollBeginDrag}
              onScroll={onScroll}
              onScrollEndDrag={onScrollEndDrag}
              onMomentumScrollEnd={onScrollEndDrag}
              scrollEventThrottle={16}
            >
              {results===null&&hasMore ? <Pressable style={styles.loadMore} disabled={loadingOlder}
                onPress={()=>void onLoadOlder()}><Text style={styles.loadMoreText}>{loadingOlder?'Cargando…':'Cargar mensajes anteriores'}</Text></Pressable>:null}
              {results!==null?<Text style={styles.searchCount}>{results.length} resultado(s)</Text>:null}
              {!messages.length ? <Text style={styles.empty}>¡Hola! Envía el primer mensaje. Aparecerá en los dos dispositivos.</Text> : null}
              {(results??messages).filter(message=>!message.deletedAt).map(message => {
                const mine = message.senderId === session.actorId;
                const badges=display.reactionBadges.get(message.seq)??[];
                return (
                  <SwipeableBubble
                    key={message.senderId + ':' + message.clientMessageId}
                    style={[styles.bubble, mine ? styles.mine : styles.theirs]}
                    onReply={() => onReply(message)}
                    onLongPress={(anchor) => onMessageLongPress(message,anchor)}
                    onPress={() => {if(mine && message.pending && message.deliveryStatus==='error')onRetry(message.clientMessageId);}}
                  >
                    {!mine && <Text style={styles.sender}>{message.senderName}</Text>}
                    {message.replyToSeq ? (
                      <Text style={[styles.replyLabel,mine && styles.mineMeta]}>
                        ↪ {display.replySnippets.get(message.replyToSeq)||'Mensaje anterior'}
                      </Text>
                    ) : null}
                    {!message.media?<Text style={[styles.bubbleText,mine && styles.mineText]}>
                      {message.text}
                    </Text>:null}
                    {message.media?<NativeChatMediaView media={message.media} session={session}/>:null}
                    {message.seq>0 && !message.deletedAt && badges.length>0 ? (
                      <View style={styles.reactionBadges}>
                        {badges.map(({emoji,count})=>(
                          <Text key={emoji} style={styles.reactionBadge}>{emoji}{count}</Text>
                        ))}
                      </View>
                    ):null}
                    <Text style={[styles.messageTime,mine && styles.mineMeta]}>
                      {new Date(message.sentAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      {message.editedAt&&!message.deletedAt?' · editado':''}
                      {mine?' · '+messageDeliveryLabel(message):''}
                      {mine&&!message.pending&&display.lastReadByOther>=message.seq?' · leído':''}
                    </Text>
                  </SwipeableBubble>
                );
              })}
            </ScrollView>
 );
}
