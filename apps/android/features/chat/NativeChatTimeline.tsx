import React,{memo,useMemo,useState,type RefObject} from 'react';
import {FlatList,View,Text,Pressable,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {
 buildChatDisplayIndex,groupChatMediaMessages,selectChatGalleryMedia,
 type ChatMessage,type ChatReaction,type ChatReadReceipt,type ChatSession,type ChatEmoji,
} from '@havana/shared';
import SwipeableBubble,{type BubbleAnchor} from './SwipeableBubble';
import NativeChatMediaView from './NativeChatMediaView';
import NativeChatGallery from './NativeChatGallery';
import {styles} from '../../styles/chat-styles';

// Only visible-window cells mount media/video; one NativeApp owns the socket,
// persistent outbox, pagination, scroll lifecycle and authenticated session.
type Props={
 messages:ChatMessage[];
 session:ChatSession;
 onlineActorIds:ReadonlySet<string>;
 connected:boolean;
 reactions:ChatReaction[];
 receipts:ChatReadReceipt[];
 hasMore:boolean;
 loadingOlder:boolean;
 scrollRef:RefObject<FlatList<ChatMessage>|null>;
 onContentSizeChange:()=>void;
 onLayout:()=>void;
 onScrollBeginDrag:()=>void;
 onScroll:(event:NativeSyntheticEvent<NativeScrollEvent>)=>void;
 onScrollEndDrag:(event:NativeSyntheticEvent<NativeScrollEvent>)=>void;
 onLoadOlder:()=>void;
 onReply:(message:ChatMessage)=>void;
 onMessageLongPress:(message:ChatMessage,anchor:BubbleAnchor)=>void;
 onQuickReact:(message:ChatMessage,emoji:ChatEmoji,origin:{x:number;y:number})=>void;
 onRetry:(clientMessageId:string)=>void;
};
function NativeChatTimeline({
 messages,session,onlineActorIds,connected,reactions,receipts,hasMore,loadingOlder,
 scrollRef,onContentSizeChange,onLayout,onScrollBeginDrag,onScroll,onScrollEndDrag,
 onLoadOlder,onReply,onMessageLongPress,onQuickReact,onRetry,
}:Props){
 const [gallery,setGallery]=useState<{items:NonNullable<ChatMessage['media']>[];initial:number}|null>(null);
 const display=useMemo(()=>buildChatDisplayIndex(messages,reactions,receipts,session.actorId),
   [messages,reactions,receipts,session.actorId]);
 const liveRenderData=useMemo(()=>({display,onlineActorIds,connected}),
   [display,onlineActorIds,connected]);
 const galleries=useMemo(()=>groupChatMediaMessages(messages.filter(message=>!message.deletedAt)),[messages]);
 const visibleMessages=useMemo(()=>galleries.map(group=>group[group.length-1]!).reverse(),[galleries]);
 const groupLeads=useMemo(()=>{
  const map=new Map<string,ChatMessage[]>();
  for(const group of galleries)if(group.length>1)map.set(group[group.length-1]!.clientMessageId,group);
  return map;
 },[galleries]);

 const renderBubble=(message:ChatMessage,compact=false)=>{
  const mine=message.senderId===session.actorId;
  const badges=display.reactionBadges.get(message.seq)??[];
  const online=connected&&onlineActorIds.has(message.senderId);
  return <SwipeableBubble
   style={[styles.bubble,mine?styles.mine:styles.theirs,online&&styles.onlineBubble,
    compact&&styles.galleryBubble]}
   onReply={() => onReply(message)}
   onLongPress={(anchor) => onMessageLongPress(message,anchor)}
   onPress={() => {if(mine && message.pending && message.deliveryStatus==='error')onRetry(message.clientMessageId);}}>
   {!mine&&!compact&&<Text style={[styles.sender,online&&styles.onlineText]}>{message.senderName}</Text>}
   {message.replyToSeq?<Text style={[styles.replyLabel,mine&&styles.mineMeta,online&&styles.onlineMeta]}>
    ↪ {display.replySnippets.get(message.replyToSeq)||'Mensaje anterior'}
   </Text>:null}
   {!message.media?<Text style={[styles.bubbleText,mine&&styles.mineText,online&&styles.onlineText]}>
    {message.text}</Text>:null}
   {message.media?<NativeChatMediaView media={message.media} session={session} compact={compact}
    onOpen={id=>{
     const selection=selectChatGalleryMedia(messages,{
      clientMessageId:message.clientMessageId,senderId:message.senderId,assetId:id,
     });
     if(selection)setGallery(selection);
    }}/>:null}
   {message.seq>0&&!message.deletedAt&&badges.length>0?<View
    style={[styles.reactionBadges,compact&&styles.galleryReactions]}>
    {badges.map(({emoji,count})=><Pressable key={emoji} accessibilityRole="button"
     accessibilityLabel={'Reaccionar con '+emoji} disabled={!connected}
     onPress={event=>onQuickReact(message,emoji as ChatEmoji,{
      x:event.nativeEvent.pageX,y:event.nativeEvent.pageY
     })}><Text style={styles.reactionBadge}>{emoji}{count}</Text></Pressable>)}
   </View>:null}
   {message.seq>0&&!message.deletedAt&&connected&&!compact&&<Pressable
    accessibilityRole="button" accessibilityLabel={'Elegir reacción para mensaje de '+message.senderName}
    style={styles.reactionTrigger} onPress={event=>onMessageLongPress(message,{
     x:event.nativeEvent.pageX-20,y:event.nativeEvent.pageY-20,width:40,height:40
    })}><Text style={styles.reactionTriggerText}>♡ +</Text></Pressable>}
   {mine&&!compact&&<Text accessibilityLabel={!message.pending&&message.seq>0&&display.lastReadByOther>=message.seq?'Leído':'Enviado'}
     style={[styles.messageTime,styles.deliveryTicks,styles.mineMeta,online&&styles.onlineMeta]}>
     {!message.pending&&message.seq>0&&display.lastReadByOther>=message.seq?'✓✓':'✓'}
   </Text>}
  </SwipeableBubble>;
 };

 return (
  <>
  <FlatList
   // Reverse the chronology once and use an inverted list: index zero is the
   // latest message at the screen bottom, even before Android measures videos.
   // This is stable for pagination and does not invert the message contents.
   inverted
   ref={scrollRef} data={visibleMessages}
   extraData={liveRenderData}
   keyExtractor={message=>message.senderId+':'+message.clientMessageId}
   style={styles.messageList} contentContainerStyle={styles.messages}
   keyboardShouldPersistTaps="handled"
   // Virtualize heavy photo/video bubbles, without clipping Android SurfaceView.
   initialNumToRender={10} maxToRenderPerBatch={8}
   windowSize={7} updateCellsBatchingPeriod={40}
   removeClippedSubviews={false}
   // Keep the visible anchor when the user requests older messages.
   maintainVisibleContentPosition={{minIndexForVisible:0}}
   onContentSizeChange={onContentSizeChange}
   onLayout={onLayout}
   onScrollBeginDrag={onScrollBeginDrag}
   onScroll={onScroll}
   onScrollEndDrag={onScrollEndDrag}
   onMomentumScrollEnd={onScrollEndDrag}
   scrollEventThrottle={16}
   ListFooterComponent={<>
    {hasMore?<Pressable style={styles.loadMore} disabled={loadingOlder}
      onPress={()=>void onLoadOlder()}><Text style={styles.loadMoreText}>{loadingOlder?'Cargando…':'Cargar mensajes anteriores'}</Text></Pressable>:null}
   </>}
   ListEmptyComponent={!messages.length
    ?<Text style={styles.empty}>¡Hola! Envía el primer mensaje. Aparecerá en los dos dispositivos.</Text>
    :undefined}
   renderItem={({item:message})=>{
    const grouped=groupLeads.get(message.clientMessageId);
    if(!grouped)return renderBubble(message);
    const mine=message.senderId===session.actorId;
    return <View style={[styles.galleryCluster,mine?styles.galleryMine:styles.galleryTheirs]}>
     {!mine&&<Text style={styles.gallerySender}>{message.senderName}</Text>}
     <View style={styles.galleryGrid}>
      {grouped.map(item=><View key={item.senderId+':'+item.clientMessageId}
       style={styles.galleryCell}>{renderBubble(item,true)}</View>)}
     </View>
     {mine&&<Text style={styles.galleryDelivery}
      accessibilityLabel={message.seq>0&&display.lastReadByOther>=message.seq?'Leído':'Enviado'}>
      {message.seq>0&&display.lastReadByOther>=message.seq?'✓✓':'✓'}
     </Text>}
    </View>;
   }}
  />
  {gallery&&<NativeChatGallery items={gallery.items} initial={gallery.initial}
   session={session} onClose={()=>setGallery(null)}/>}
  </>
 );
}

// A live typing indicator must not remount video surfaces in the FlatList.
export default memo(NativeChatTimeline);
