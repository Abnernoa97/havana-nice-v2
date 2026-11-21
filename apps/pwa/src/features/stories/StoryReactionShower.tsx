import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {makeChatReactionParticles,CHAT_REACTION_BURST_WAVES,
 CHAT_REACTION_BURST_WAVE_GAP_MS,CHAT_REACTION_BURST_MAX_PARTICLES,
 type ChatEmoji,type ChatReactionParticle,type StoryEmoji} from '@havana/shared';

// Reuses Chat's pure emoji geometry; no duplicate animation policy,
// transport, session or persistent Chat reactions.
export type StoryReactionBurst={id:number;emoji:StoryEmoji;x:number;y:number};
export default function StoryReactionShower({burst}:{burst:StoryReactionBurst|null}){
 const [particles,setParticles]=useState<ChatReactionParticle[]>([]);
 const nextId=useRef(1);
 useEffect(()=>{
  if(!burst)return;
  const timers:ReturnType<typeof setTimeout>[]=[];
  const spawn=()=>{
   const next=makeChatReactionParticles(burst.emoji as ChatEmoji,
    {x:burst.x,y:burst.y},{width:window.innerWidth,height:window.innerHeight},nextId.current);
   nextId.current+=next.length;
   setParticles(old=>[...old,...next].slice(-CHAT_REACTION_BURST_MAX_PARTICLES));
  };
  spawn();
  for(let i=1;i<CHAT_REACTION_BURST_WAVES;i++)
   timers.push(setTimeout(spawn,i*CHAT_REACTION_BURST_WAVE_GAP_MS));
  return()=>timers.forEach(clearTimeout);
 },[burst]);
 if(!particles.length)return null;
 return <div className="hn-story-shower" aria-hidden="true">
  {particles.map(p=><span key={p.id} className="hn-story-particle"
   style={{
    left:p.x,top:p.y,fontSize:p.size,
    animationDuration:p.duration+'ms',
    '--dx':p.dx+'px','--dy':p.dy+'px'
   } as CSSProperties}
   onAnimationEnd={()=>setParticles(before=>before.filter(v=>v.id!==p.id))}>
    {p.emoji}
   </span>)}
 </div>;
}
