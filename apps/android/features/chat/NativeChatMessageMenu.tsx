import React from 'react';
import {Modal,Pressable,Text,View} from 'react-native';
import type {ChatMessage,ChatEmoji,ChatReaction} from '@havana/shared';
import {styles} from '../../styles/chat-styles';

// Tapping a reaction saves exactly one reaction. Visual particle effects
// are rendered outside the modal so they continue after it closes.
type Props={message:ChatMessage|null;actorId:string;connection:string;reactions:ChatReaction[];
 left:number;top:number;width:number;
 onClose:()=>void;
 onReact:(message:ChatMessage,emoji:ChatEmoji,origin:{x:number;y:number})=>void;};
export default function NativeChatMessageMenu({message,actorId,connection,reactions,
 left,top,width,onClose,onReact}:Props){
 // A Modal opens during the same finger gesture that triggers long-press.
 // Dismiss only after a NEW press actually starts on the backdrop, not after
 // an arbitrary 350 ms: holding the original finger must never close emojis.
 const backdropTouchStarted=React.useRef(false);
 React.useEffect(()=>{backdropTouchStarted.current=false;},[message]);
 return <Modal animationType="fade" transparent statusBarTranslucent visible={!!message}
      onShow={()=>{backdropTouchStarted.current=false;}}
      onRequestClose={onClose}>
   <Pressable style={styles.whatsappBackdrop}
     onPressIn={()=>{backdropTouchStarted.current=true;}}
     onPress={()=>{if(backdropTouchStarted.current){
       backdropTouchStarted.current=false;onClose();
     }}}>
     {message?<Pressable accessibilityLabel="Reaccionar al mensaje"
       style={[styles.whatsappContext,{left,top,width}]}
       onPress={event=>event.stopPropagation()}>
       <View style={styles.whatsappEmojiBar}>
         {(['👍','❤️','😂'] as ChatEmoji[]).map(emoji=>
           <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={emoji}
             disabled={connection!=='en vivo'}
             style={[styles.whatsappEmoji,connection!=='en vivo'&&styles.disabledMenuAction,
               reactions.some(r=>r.messageSeq===message.seq&&r.actorId===actorId&&r.emoji===emoji)
               &&styles.selectedMenuReaction]}
             onPress={event=>{event.stopPropagation();onReact(message,emoji,{
               x:event.nativeEvent.pageX,y:event.nativeEvent.pageY,
             });}}>
             <Text style={styles.whatsappEmojiText}>{emoji}</Text>
           </Pressable>)}
       </View>
     </Pressable>:null}
   </Pressable>
 </Modal>;
}
