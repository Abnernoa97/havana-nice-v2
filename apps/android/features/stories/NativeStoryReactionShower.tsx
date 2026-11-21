import React,{useEffect,useRef,useState} from 'react';
import {Animated,Easing,View,useWindowDimensions} from 'react-native';
import {makeChatReactionParticles,CHAT_REACTION_BURST_WAVES,
 CHAT_REACTION_BURST_WAVE_GAP_MS,CHAT_REACTION_BURST_PER_TICK,
 CHAT_REACTION_BURST_MAX_PARTICLES,type ChatEmoji,type ChatReactionParticle,
 type StoryEmoji} from '@havana/shared';

export type NativeStoryBurst={id:number;emoji:StoryEmoji;x:number;y:number};
// Uses the PURE shared Chat particle geometry, never Chat's socket or messages.
const Particle=React.memo(function Particle({data,onFinish}:{
 data:ChatReactionParticle;onFinish:(id:number)=>void;
}){
 const value=useRef(new Animated.Value(0)).current;
 useEffect(()=>{
  const a=Animated.timing(value,{toValue:1,duration:data.duration,
   easing:Easing.out(Easing.cubic),useNativeDriver:true});
  a.start(({finished})=>{if(finished)onFinish(data.id);});
  return()=>a.stop();
 },[value,data,onFinish]);
 return <Animated.Text pointerEvents="none" style={{position:'absolute',left:data.x,top:data.y,
  fontSize:data.size,opacity:value.interpolate({inputRange:[0,.15,.75,1],outputRange:[0,1,1,0]}),
  transform:[
   {translateX:value.interpolate({inputRange:[0,1],outputRange:[0,data.dx]})},
   {translateY:value.interpolate({inputRange:[0,1],outputRange:[0,data.dy]})},
   {scale:value.interpolate({inputRange:[0,1],outputRange:[.7,1.2]})}
  ]}}>{data.emoji}</Animated.Text>;
});
export default function NativeStoryReactionShower({burst}:{
 burst:NativeStoryBurst|null;
}){
 const {width,height}=useWindowDimensions();
 const [particles,setParticles]=useState<ChatReactionParticle[]>([]);
 const nextId=useRef(1);
 useEffect(()=>{
  if(!burst)return;
  const timers:Array<ReturnType<typeof setTimeout>>=[];
  const emit=()=>{
   // ChatEmoji currently lacks claps; the shared geometry is emoji-agnostic.
   const created=makeChatReactionParticles(burst.emoji as ChatEmoji,
    {x:burst.x,y:burst.y},{width,height},nextId.current);
   nextId.current+=CHAT_REACTION_BURST_PER_TICK;
   setParticles(old=>[...old,...created].slice(-CHAT_REACTION_BURST_MAX_PARTICLES));
  };
  emit();
  for(let i=1;i<CHAT_REACTION_BURST_WAVES;i++)
   timers.push(setTimeout(emit,i*CHAT_REACTION_BURST_WAVE_GAP_MS));
  return()=>timers.forEach(clearTimeout);
 },[burst,width,height]);
 return <View pointerEvents="none" style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:30}}>
  {particles.map(p=><Particle key={p.id} data={p}
   onFinish={id=>setParticles(old=>old.filter(x=>x.id!==id))}/>)}
 </View>;
}
