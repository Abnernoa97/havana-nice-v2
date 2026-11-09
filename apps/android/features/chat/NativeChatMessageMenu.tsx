import React,{useCallback,useEffect,useRef,useState} from 'react';
import {
 Animated,Easing,Modal,Pressable,Text,View,useWindowDimensions,
} from 'react-native';
import {
 makeChatReactionParticles,CHAT_REACTION_BURST_HOLD_MS,CHAT_REACTION_BURST_TICK_MS,
 CHAT_REACTION_BURST_PER_TICK,CHAT_REACTION_BURST_MAX_PARTICLES,
 type ChatReactionParticle,type ChatMessage,type ChatEmoji,type ChatReaction,
} from '@havana/shared';
import {styles} from '../../styles/chat-styles';

// Run each particle on the native animation driver, without rerendering the chat.
const FloatingEmoji=React.memo(function FloatingEmoji({particle,onDone}:{
 particle:ChatReactionParticle;onDone:(id:number)=>void;
}){
 const progress=useRef(new Animated.Value(0)).current;
 useEffect(()=>{
   const animation=Animated.timing(progress,{
     toValue:1,duration:particle.duration,
     easing:Easing.out(Easing.cubic),useNativeDriver:true,
   });
   animation.start(({finished})=>{if(finished)onDone(particle.id);});
   return()=>animation.stop();
 },[particle,progress,onDone]);
 const x=progress.interpolate({inputRange:[0,1],outputRange:[0,particle.dx]});
 const y=progress.interpolate({inputRange:[0,1],outputRange:[0,particle.dy]});
 const alpha=progress.interpolate({inputRange:[0,.12,.76,1],outputRange:[0,1,1,0]});
 const scale=progress.interpolate({inputRange:[0,1],outputRange:[.72,1.18]});
 return <Animated.Text style={{
   position:'absolute',left:particle.x,top:particle.y,fontSize:particle.size,
   opacity:alpha,transform:[{translateX:x},{translateY:y},{scale}],
 }} pointerEvents="none">{particle.emoji}</Animated.Text>;
});

// A short press sends one reaction. Long press only starts a LOCAL emoji shower.
// No duplicated Chat messages, WebSockets, tokens or persistent reactions.
type Props={message:ChatMessage|null;actorId:string;connection:string;reactions:ChatReaction[];
 left:number;top:number;width:number;
 onClose:()=>void;onReact:(message:ChatMessage,emoji:ChatEmoji)=>void;};

export default function NativeChatMessageMenu({message,actorId,connection,reactions,
 left,top,width,onClose,onReact}:Props){
 const {width:screenWidth,height:screenHeight}=useWindowDimensions();
 const [particles,setParticles]=useState<ChatReactionParticle[]>([]);
 const [activeEmoji,setActiveEmoji]=useState<ChatEmoji|null>(null);
 const repeatTimer=useRef<ReturnType<typeof setInterval>|null>(null);
 const pressConsumed=useRef(false);
 const nextParticleId=useRef(0);
 const origin=useRef({x:0,y:0});
 const clearTimer=()=>{
   if(repeatTimer.current)clearInterval(repeatTimer.current);
   repeatTimer.current=null;
 };
 const stopBurst=()=>{clearTimer();setActiveEmoji(null);};
 const removeParticle=useCallback((id:number)=>{
   setParticles(before=>before.filter(particle=>particle.id!==id));
 },[]);
 const emit=(emoji:ChatEmoji)=>{
   const next=makeChatReactionParticles(emoji,origin.current,
     {width:screenWidth,height:screenHeight},nextParticleId.current);
   nextParticleId.current+=CHAT_REACTION_BURST_PER_TICK;
   setParticles(before=>[...before,...next].slice(-CHAT_REACTION_BURST_MAX_PARTICLES));
 };
 const beginBurst=(emoji:ChatEmoji,point:{x:number;y:number})=>{
   if(connection!=='en vivo')return;
   clearTimer();
   pressConsumed.current=true;
   origin.current=point;
   setActiveEmoji(emoji);
   emit(emoji);
   repeatTimer.current=setInterval(()=>emit(emoji),CHAT_REACTION_BURST_TICK_MS);
 };
 useEffect(()=>{
   setParticles([]);
   return()=>clearTimer();
 },[message?.seq,connection]);

 return <Modal animationType="fade" transparent statusBarTranslucent visible={!!message}
      onRequestClose={onClose}>
   <Pressable style={styles.whatsappBackdrop} onPress={onClose}>
     <View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0}} accessible={false}>
       {particles.map(particle=><FloatingEmoji key={particle.id}
         particle={particle} onDone={removeParticle}/>)}
     </View>
     {message?<Pressable accessibilityLabel="Reaccionar al mensaje"
       style={[styles.whatsappContext,{left,top,width}]} onPress={()=>{}}>
       <View style={styles.whatsappEmojiBar}>
         {(['👍','❤️','😂'] as ChatEmoji[]).map(emoji=>
           <Pressable key={emoji} accessibilityRole="button" accessibilityLabel={emoji}
             disabled={connection!=='en vivo'}
             delayLongPress={CHAT_REACTION_BURST_HOLD_MS}
             onPressIn={()=>{pressConsumed.current=false;}}
             onLongPress={event=>beginBurst(emoji,{
               x:event.nativeEvent.pageX,y:event.nativeEvent.pageY,
             })}
             onPressOut={stopBurst}
             style={[styles.whatsappEmoji,connection!=='en vivo'&&styles.disabledMenuAction,
               (activeEmoji===emoji||
                 reactions.some(r=>r.messageSeq===message.seq&&r.actorId===actorId&&r.emoji===emoji))
               &&styles.selectedMenuReaction]}
             onPress={()=>{
               if(pressConsumed.current){pressConsumed.current=false;return;}
               onReact(message,emoji);
             }}>
             <Text style={styles.whatsappEmojiText}>{emoji}</Text>
           </Pressable>)}
       </View>
     </Pressable>:null}
   </Pressable>
 </Modal>;
}
