import React from 'react';
import {Modal,Pressable,Text,View} from 'react-native';
import type {ChatMessage,ChatEmoji,ChatReaction} from '@havana/shared';
import {styles} from '../../styles/chat-styles';
// Long press is reactions-only; swipe right handles replies in the native timeline.
type Props={message:ChatMessage|null;actorId:string;connection:string;reactions:ChatReaction[];
 left:number;top:number;width:number;
 onClose:()=>void;onReact:(message:ChatMessage,emoji:ChatEmoji)=>void;};
export default function NativeChatMessageMenu({message,actorId,connection,reactions,
 left,top,width,onClose,onReact}:Props){
 return <Modal animationType="fade" transparent statusBarTranslucent visible={!!message}
      onRequestClose={onClose}>
   <Pressable style={styles.whatsappBackdrop} onPress={onClose}>
     {message?<Pressable accessibilityLabel="Reaccionar al mensaje"
       style={[styles.whatsappContext,{left,top,width}]} onPress={()=>{}}>
       <View style={styles.whatsappEmojiBar}>
         {(['👍','❤️','😂'] as ChatEmoji[]).map(emoji=>
           <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={emoji}
             disabled={connection!=='en vivo'}
             style={[styles.whatsappEmoji,connection!=='en vivo'&&styles.disabledMenuAction,
               reactions.some(r=>r.messageSeq===message.seq&&r.actorId===actorId&&r.emoji===emoji)
               &&styles.selectedMenuReaction]}
             onPress={()=>onReact(message,emoji)}>
             <Text style={styles.whatsappEmojiText}>{emoji}</Text>
           </Pressable>)}
       </View>
     </Pressable>:null}
   </Pressable>
 </Modal>;
}
