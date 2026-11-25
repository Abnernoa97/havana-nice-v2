import React,{memo,useEffect,useMemo,useRef,useState,type RefObject} from 'react';
import {AppState,FlatList,Modal,View,Text,Pressable,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {
 buildChatDisplayIndex,groupChatMediaMessages,selectChatGalleryMedia,
 type ChatMessage,type ChatReaction,type ChatReadReceipt,type ChatSession,type ChatEmoji,
} from '@havana/shared';
import SwipeableBubble,{type BubbleAnchor} from './SwipeableBubble';
import NativeChatMediaView from './NativeChatMediaView';
import NativeChatGallery from './NativeChatGallery';
import NativeChatMediaQueuePreview from './NativeChatMediaQueuePreview';
import type {NativeQueuedMedia} from './useNativeMediaSelection';
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
 onReadVisible:(seq:number)=>void;
 pendingMedia:NativeQueuedMedia[];
 pendingProgress:number;
 pendingUploading:boolean;
 onCancelPending:()=>void;
};
function NativeChatTimeline({
 messages,session,onlineActorIds,connected,reactions,receipts,hasMore,loadingOlder,
 scrollRef,onContentSizeChange,onLayout,onScrollBeginDrag,onScroll,onScrollEndDrag,
 onLoadOlder,onReply,onMessageLongPress,onQuickReact,onRetry,onReadVisible,
 pendingMedia,pendingProgress,pendingUploading,onCancelPending,
}:Props){
 const [gallery,setGallery]=useState<{items:NonNullable<ChatMessage['media']>[];initial:number}|null>(null);
 const [readerSeq,setReaderSeq]=useState<number|null>(null);
 const display=useMemo(()=>buildChatDisplayIndex(messages,reactions,receipts,session.actorId),
   [messages,reactions,receipts,session.actorId]);
 const liveRenderData=useMemo(()=>({display,onlineActorIds,connected}),
   [display,onlineActorIds,connected]);
 const galleries=useMemo(()=>groupChatMediaMessages(messages.filter(message=>!message.deletedAt)),[messages]);
 // A logical album can contain hundreds of items. Virtualize its two-column
 // rows rather than mounting an entire album as one FlatList cell.
 const {visibleMessages,groupLeads}=useMemo(()=>{
  const rows:ChatMessage[]=[];
  const map=new Map<string,{items:ChatMessage[];first:boolean;last:boolean}>();
  for(const group of galleries){
   if(group.length===1){rows.push(group[0]!);continue;}
   // Odd albums start with one full-width tile; every following row has two.
   for(let i=0;i<group.length;){
    const count=i===0&&group.length%2===1?1:2;
    const items=group.slice(i,i+count);
    const lead=items[items.length-1]!;
    rows.push(lead);
    map.set(lead.senderId+':'+lead.clientMessageId,{items,first:i===0,last:i+count>=group.length});
    i+=count;
   }
  }
  return {visibleMessages:rows.reverse(),groupLeads:map};
 },[galleries]);

 const selected=readerSeq===null?null:messages.find(message=>message.seq===readerSeq);
 const readerList=selected?display.deliveryFor(selected).readers:[];
 // Viewability belongs to the FlatList, not the history fetch/socket.
 const viewed=useRef(0);
 const readEnabled=connected&&!gallery&&readerSeq===null;
 const readRef=useRef({onReadVisible,readEnabled});
 readRef.current={onReadVisible,readEnabled};
 const viewabilityConfig=useRef({itemVisiblePercentThreshold:50,minimumViewTime:250}).current;
 const onViewableItemsChanged=useRef(({viewableItems}:{viewableItems:ReadonlyArray<{item:unknown;isViewable:boolean}>})=>{
  viewed.current=viewableItems.reduce((max,entry)=>{
   const item=entry.item as ChatMessage;
   return entry.isViewable&&item&&!item.pending&&!item.deletedAt&&item.seq>0?Math.max(max,item.seq):max;
  },0);
  if(readRef.current.readEnabled&&viewed.current>0)readRef.current.onReadVisible(viewed.current);
 }).current;
 useEffect(()=>{
  const report=()=>{if(readRef.current.readEnabled&&viewed.current>0)readRef.current.onReadVisible(viewed.current);};
  if(readEnabled)report();
  const sub=AppState.addEventListener('change',state=>{if(state==='active')report();});
  return()=>sub.remove();
 },[readEnabled,onReadVisible]);
 const delivery=(message:ChatMessage,grouped=false)=>{
  const info=display.deliveryFor(message);
  const style=grouped?styles.galleryDelivery:[styles.messageTime,styles.deliveryLabel,styles.mineMeta];
  return info.readers.length>0
   ?<Pressable accessibilityRole="button" accessibilityLabel={info.label+'. Ver nombres'} hitSlop={6}
      onPress={event=>{event.stopPropagation();setReaderSeq(message.seq);}}>
     <Text style={style}>{info.label}</Text></Pressable>
   :<Text style={style}>{info.label}</Text>;
 };
 const renderBubble=(message:ChatMessage,compact=false,wide=false)=>{
  const mine=message.senderId===session.actorId;
  const badges=display.reactionBadges.get(message.seq)??[];
  const online=connected&&onlineActorIds.has(message.senderId);
  return <SwipeableBubble
   style={compact?styles.galleryBubble:[styles.bubble,mine?styles.mine:styles.theirs,online&&styles.onlineBubble]}
   onReply={() => onReply(message)}
   onLongPress={(anchor) => onMessageLongPress(message,anchor)}
   onPress={() => {if(mine && message.pending && message.deliveryStatus==='error')onRetry(message.clientMessageId);}}>
   {!mine&&!compact&&<Text style={[styles.sender,online&&styles.onlineText]}>{message.senderName}</Text>}
   {message.replyToSeq?<Text style={[styles.replyLabel,mine&&styles.mineMeta,online&&styles.onlineMeta]}>
    ↪ {display.replySnippets.get(message.replyToSeq)||'Mensaje anterior'}
   </Text>:null}
   {!message.media?<Text style={[styles.bubbleText,mine&&styles.mineText,online&&styles.onlineText]}>
    {message.text}</Text>:null}
   {message.media?<NativeChatMediaView media={message.media} session={session} compact={compact} wide={wide} canRepair={mine}
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
   {mine&&!compact&&delivery(message)}
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
   viewabilityConfig={viewabilityConfig} onViewableItemsChanged={onViewableItemsChanged}
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
   ListHeaderComponent={pendingUploading?<NativeChatMediaQueuePreview
    selectedMedia={pendingMedia} mediaUploading={true} mediaProgress={pendingProgress} mediaReady={true}
    onRemove={()=>{}} inTimeline onCancel={onCancelPending}/>:null}
   ListFooterComponent={<>
    {hasMore?<Pressable style={styles.loadMore} disabled={loadingOlder}
      onPress={()=>void onLoadOlder()}><Text style={styles.loadMoreText}>{loadingOlder?'Cargando…':'Cargar mensajes anteriores'}</Text></Pressable>:null}
   </>}
   ListEmptyComponent={!messages.length
    ?<Text style={styles.empty}>¡Hola! Envía el primer mensaje. Aparecerá en los dos dispositivos.</Text>
    :undefined}
   renderItem={({item:message})=>{
    const grouped=groupLeads.get(message.senderId+':'+message.clientMessageId);
    if(!grouped)return renderBubble(message);
    const mine=message.senderId===session.actorId;
    return <View style={[styles.galleryCluster,mine?styles.galleryMine:styles.galleryTheirs,!grouped.last&&{marginBottom:3}]}>
     {!mine&&grouped.first&&<Text style={styles.gallerySender}>{message.senderName}</Text>}
     <View style={styles.galleryGrid}>
      {grouped.items.map(item=><View key={item.senderId+':'+item.clientMessageId}
       style={[styles.galleryCell,grouped.items.length===1&&styles.galleryWideCell]}>{renderBubble(item,true,grouped.items.length===1)}</View>)}
     </View>
     {mine&&grouped.last&&delivery(message,true)}
    </View>;
   }}
  />
  <Modal visible={readerSeq!==null} transparent animationType="fade" onRequestClose={()=>setReaderSeq(null)}>
   <View style={styles.receiptBackdrop}>
    <Pressable style={styles.receiptDismiss} accessibilityLabel="Cerrar confirmaciones" onPress={()=>setReaderSeq(null)}/>
    <View style={styles.receiptPanel} accessibilityViewIsModal>
     <View style={styles.receiptHeading}><Text style={styles.receiptTitle}>Leído por</Text>
      <Pressable accessibilityRole="button" onPress={()=>setReaderSeq(null)}><Text style={styles.receiptClose}>Cerrar</Text></Pressable></View>
     {readerList.length?readerList.map(reader=><Text key={reader.actorId} style={styles.receiptName}>{reader.displayName||'Nombre no disponible'}</Text>):
      <Text style={styles.receiptName}>Sin confirmaciones de lectura.</Text>}
    </View>
   </View>
  </Modal>
  {gallery&&<NativeChatGallery items={gallery.items} initial={gallery.initial}
   session={session} onClose={()=>setGallery(null)}/>}
  </>
 );
}

// A live typing indicator must not remount video surfaces in the FlatList.
export default memo(NativeChatTimeline);
