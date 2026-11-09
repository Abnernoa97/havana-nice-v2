import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Animated,Easing,Platform,StatusBar,View,useWindowDimensions} from 'react-native';
import {
 makeChatReactionParticles,CHAT_REACTION_BURST_PER_TICK,
 CHAT_REACTION_BURST_MAX_PARTICLES,type ChatReactionParticle,type ChatEmoji,
} from '@havana/shared';

// Entirely visual: this overlay never intercepts Chat touches or sends events.
export type ReactionShowerBurst={
 id:number;emoji:ChatEmoji;x:number;y:number;
};
const WAVES=9;
const WAVE_GAP_MS=95;

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
 const translateX=progress.interpolate({inputRange:[0,1],outputRange:[0,particle.dx]});
 const translateY=progress.interpolate({inputRange:[0,1],outputRange:[0,particle.dy]});
 const opacity=progress.interpolate({inputRange:[0,.12,.76,1],outputRange:[0,1,1,0]});
 const scale=progress.interpolate({inputRange:[0,1],outputRange:[.72,1.18]});
 return <Animated.Text pointerEvents="none" style={{
   position:'absolute',left:particle.x,top:particle.y,fontSize:particle.size,
   opacity,transform:[{translateX},{translateY},{scale}],
 }}>{particle.emoji}</Animated.Text>;
});

export default function NativeChatReactionShower({burst}:{
 burst:ReactionShowerBurst|null;
}){
 const {width,height}=useWindowDimensions();
 const [particles,setParticles]=useState<ChatReactionParticle[]>([]);
 const timers=useRef<Array<ReturnType<typeof setTimeout>>>([]);
 const nextParticleId=useRef(0);
 const clearTimers=()=>{
   for(const timer of timers.current)clearTimeout(timer);
   timers.current=[];
 };
 const removeParticle=useCallback((id:number)=>{
   setParticles(before=>before.filter(p=>p.id!==id));
 },[]);
 useEffect(()=>{
   if(!burst)return;
   clearTimers();
   const origin={
     x:burst.x,
     y:burst.y-(Platform.OS==='android'?(StatusBar.currentHeight??0):0),
   };
   const emit=()=>{
     const next=makeChatReactionParticles(burst.emoji,origin,
       {width,height},nextParticleId.current);
     nextParticleId.current+=CHAT_REACTION_BURST_PER_TICK;
     setParticles(before=>[...before,...next].slice(-CHAT_REACTION_BURST_MAX_PARTICLES));
   };
   emit();
   for(let wave=1;wave<WAVES;wave++)timers.current.push(setTimeout(emit,wave*WAVE_GAP_MS));
   return clearTimers;
 },[burst,width,height]);
 if(!particles.length)return null;
 return <View pointerEvents="none" accessible={false}
   style={{position:'absolute',top:0,left:0,right:0,bottom:0,elevation:50}}>
   {particles.map(particle=><FloatingEmoji key={particle.id}
     particle={particle} onDone={removeParticle}/>)}
 </View>;
}
