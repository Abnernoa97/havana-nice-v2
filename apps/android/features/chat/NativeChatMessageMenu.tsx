import React from 'react';
import {Alert,Modal,Pressable,Text,View} from 'react-native';
import type {ChatMessage,ChatEmoji,ChatReaction} from '@havana/shared';
import {styles} from './chat-styles';
// Presentation only: owns neither token, session lifecycle, socket nor local storage.
type Props={message:ChatMessage|null;actorId:string;connection:string;reactions:ChatReaction[];
 allowEdit:boolean;allowDelete:boolean;left:number;top:number;width:number;
 onClose:()=>void;onReact:(message:ChatMessage,emoji:ChatEmoji)=>void;
 onReply:(message:ChatMessage)=>void;onEdit:(message:ChatMessage)=>void;
 onDelete:(message:ChatMessage)=>void;};
export default function NativeChatMessageMenu({message,actorId,connection,reactions,allowEdit,allowDelete,
 left,top,width,onClose,onReact,onReply,onEdit,onDelete}:Props){
 return <Modal animationType="fade" transparent statusBarTranslucent visible={!!message}
              onRequestClose={()=>onClose()}>
              <Pressable style={styles.whatsappBackdrop} onPress={()=>onClose()}>
                {message ? <Pressable
                    accessibilityLabel="Opciones del mensaje"
                    style={[styles.whatsappContext,{
                      left,top,width,
                    }]} onPress={()=>{}}>
                  <View style={styles.whatsappEmojiBar}>
                    {(['👍','❤️','😂'] as ChatEmoji[]).map(emoji=>(
                      <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={emoji}
                        disabled={connection!=='en vivo'}
                        style={[styles.whatsappEmoji,connection!=='en vivo'&&styles.disabledMenuAction,
                          reactions.some(r=>r.messageSeq===message.seq&&r.actorId===actorId&&r.emoji===emoji)
                            &&styles.selectedMenuReaction]}
                        onPress={()=>{onReact(message,emoji);}}>
                        <Text style={styles.whatsappEmojiText}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.whatsappActionBar}>
                    <Pressable accessibilityRole="button" style={styles.whatsappAction}
                      onPress={()=>onReply(message)}>
                      <Text style={styles.whatsappActionText}>Responder</Text>
                    </Pressable>
                    {allowEdit ? <Pressable accessibilityRole="button" style={styles.whatsappAction}
                      onPress={()=>{const m=message;onClose();onEdit(m);}}>
                      <Text style={styles.whatsappActionText}>Editar</Text>
                    </Pressable> : null}
                    {allowDelete ? <Pressable accessibilityRole="button" style={styles.whatsappAction}
                      onPress={()=>{
                        const m=message;onClose();
                        Alert.alert('Borrar mensaje','¿Borrar este mensaje para todos?',[
                          {text:'Cancelar',style:'cancel'},
                          {text:'Borrar',style:'destructive',onPress:()=>onDelete(m)},
                        ]);
                      }}>
                      <Text style={styles.whatsappDeleteText}>Borrar</Text>
                    </Pressable> : null}
                  </View>
                </Pressable>:null}
              </Pressable>
            </Modal>;
}
