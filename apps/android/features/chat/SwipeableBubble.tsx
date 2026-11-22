import React,{useEffect,useRef} from 'react';
import {Animated,Pressable,type GestureResponderEvent,type StyleProp,type ViewStyle} from 'react-native';

export type BubbleAnchor={x:number;y:number;width:number;height:number};
type Props={
 children:React.ReactNode;style?:StyleProp<ViewStyle>;
 onReply:()=>void;onLongPress:(anchor:BubbleAnchor)=>void;onPress?:()=>void;
};

// Pressable owns the long press. A parent PanResponder previously stole touch
// control after slight horizontal finger movement, cancelling Android emojis.
// Swipe-to-reply observes touch movement without becoming a competing responder.
export default function SwipeableBubble({children,style,onReply,onLongPress,onPress}:Props){
 const callbacks=useRef({onReply,onLongPress,onPress});
 callbacks.current={onReply,onLongPress,onPress};
 const translation=useRef(new Animated.Value(0)).current;
 const origin=useRef({x:0,y:0});
 const moved=useRef(false);
 const reacted=useRef(false);
 const gesture=useRef({x:0,y:0});
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clear=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}};
 const reset=()=>{
  Animated.spring(translation,{toValue:0,useNativeDriver:true,bounciness:5}).start();
 };
 const open=(event?:GestureResponderEvent)=>{
  if(reacted.current||moved.current)return;
  reacted.current=true;clear();
  const x=Number(event?.nativeEvent.pageX??origin.current.x);
  const y=Number(event?.nativeEvent.pageY??origin.current.y);
  callbacks.current.onLongPress({x:x-26,y:y-22,width:52,height:44});
 };
 useEffect(()=>()=>{clear();},[]);
 return <Animated.View style={[style,{transform:[{translateX:translation}]}]}>
  <Pressable
   accessibilityHint="Mantén pulsado para reaccionar; desliza a la derecha para responder"
   delayLongPress={330}
   onPressIn={event=>{
    reacted.current=false;moved.current=false;
    const {pageX,pageY}=event.nativeEvent;
    origin.current={x:pageX,y:pageY};
    gesture.current={x:pageX,y:pageY};
    clear();
    // Android backup: Pressable.onLongPress is occasionally lost inside
    // inverted FlatList with nested photo controls.
    timer.current=setTimeout(()=>open(),470);
   }}
   onTouchMove={event=>{
    const {pageX,pageY}=event.nativeEvent;
    const dx=pageX-origin.current.x,dy=pageY-origin.current.y;
    gesture.current={x:pageX,y:pageY};
    if(Math.abs(dx)>14||Math.abs(dy)>14){moved.current=true;clear();}
    if(dx>16&&Math.abs(dx)>Math.abs(dy)*1.4){
     translation.setValue(Math.min(78,dx));
    }
   }}
   onTouchEnd={()=>{
    clear();
    const dx=gesture.current.x-origin.current.x;
    const dy=gesture.current.y-origin.current.y;
    if(!reacted.current&&dx>58&&Math.abs(dx)>Math.abs(dy)*1.3)
     callbacks.current.onReply();
    reset();
   }}
   onTouchCancel={()=>{clear();reset();}}
   onLongPress={event=>{open(event);}}
   onPress={()=>{if(!reacted.current&&!moved.current)callbacks.current.onPress?.();}}>
   {children}
  </Pressable>
 </Animated.View>;
}
