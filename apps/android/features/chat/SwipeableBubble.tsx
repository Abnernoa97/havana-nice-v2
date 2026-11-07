import React, {useRef} from 'react';
import {Animated, PanResponder, Pressable, StyleProp, ViewStyle} from 'react-native';

export type BubbleAnchor = { x: number; y: number; width: number; height: number };

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onReply: () => void;
  onLongPress: (anchor: BubbleAnchor) => void;
  onPress?: () => void;
};

// Gesture recognition is horizontal-only, allowing normal vertical scrolling.
// A right swipe (> 58 dp) replies; a long press opens the context menu.
export default function SwipeableBubble({children,style,onReply,onLongPress,onPress}:Props){
  const callbacks = useRef({onReply,onLongPress,onPress});
  callbacks.current={onReply,onLongPress,onPress};
  const translation=useRef(new Animated.Value(0)).current;
  const pressableRef=useRef<React.ElementRef<typeof Pressable>|null>(null);
  const pan=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>false,
    onMoveShouldSetPanResponder:(_,gesture)=>
      gesture.dx>16 && Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.25,
    onPanResponderGrant:()=>{translation.stopAnimation();},
    onPanResponderMove:(_,gesture)=>{
      translation.setValue(Math.min(78,Math.max(0,gesture.dx)));
    },
    onPanResponderRelease:(_,gesture)=>{
      if(gesture.dx>58 && Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.1)
        callbacks.current.onReply();
      Animated.spring(translation,{toValue:0,useNativeDriver:true,bounciness:5}).start();
    },
    onPanResponderTerminate:()=>Animated.spring(
      translation,{toValue:0,useNativeDriver:true}).start(),
  })).current;
  return (
    <Animated.View {...pan.panHandlers} style={[style,{transform:[{translateX:translation}]}]}>
      <Pressable ref={pressableRef}
        accessibilityHint="Desliza a la derecha para responder; mantén pulsado para más opciones"
        onLongPress={()=>{
          // Anchor the menu to the actual bubble; never to the screen center.
          pressableRef.current?.measureInWindow((x,y,width,height)=>{
            callbacks.current.onLongPress({x,y,width,height});
          });
        }} delayLongPress={380}
        onPress={()=>callbacks.current.onPress?.()}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
