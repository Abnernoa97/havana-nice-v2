import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {
 makeChatReactionParticles,CHAT_REACTION_BURST_PER_TICK,CHAT_REACTION_BURST_MAX_PARTICLES,
 type ChatReactionParticle,type ChatMessage,type ChatEmoji,type ChatReaction,
} from '@havana/shared';

// A single tap saves one ordinary reaction and starts a brief local shower.
// The shower remains mounted after the context menu closes.
type Props={
 message:ChatMessage|null;actorId:string;connection:string;reactions:ChatReaction[];
 left:number;top:number;width:number;
 onClose:()=>void;onReact:(message:ChatMessage,emoji:ChatEmoji)=>void;
};
const WAVES=9;
const WAVE_GAP_MS=95;

export default function PwaChatMessageMenu({message,actorId,connection,reactions,
 left,top,width,onClose,onReact}:Props){
 const [particles,setParticles]=useState<ChatReactionParticle[]>([]);
 const showerTimers=useRef<Array<ReturnType<typeof setTimeout>>>([]);
 const nextParticleId=useRef(0);
 const clearShowerTimers=()=>{
   for(const timer of showerTimers.current)clearTimeout(timer);
   showerTimers.current=[];
 };
 useEffect(()=>()=>clearShowerTimers(),[]);
 const startShower=(emoji:ChatEmoji,origin:{x:number;y:number})=>{
   clearShowerTimers();
   const emit=()=>{
     const next=makeChatReactionParticles(
       emoji,origin,{width:window.innerWidth,height:window.innerHeight},
       nextParticleId.current,
     );
     nextParticleId.current+=CHAT_REACTION_BURST_PER_TICK;
     setParticles(before=>[...before,...next].slice(-CHAT_REACTION_BURST_MAX_PARTICLES));
   };
   emit();
   for(let wave=1;wave<WAVES;wave++){
     showerTimers.current.push(setTimeout(emit,wave*WAVE_GAP_MS));
   }
 };
 return <>
   <div className="chat-reaction-shower" aria-hidden="true">
     {particles.map(particle=>
       <span key={particle.id} className="chat-reaction-particle"
         style={{
           left:particle.x,top:particle.y,fontSize:particle.size,
           animationDuration:`${particle.duration}ms`,
           '--burst-dx':`${particle.dx}px`,
           '--burst-dy':`${particle.dy}px`,
         } as CSSProperties}
         onAnimationEnd={()=>setParticles(before=>before.filter(item=>item.id!==particle.id))}>
         {particle.emoji}
       </span>)}
   </div>
   {message&&<div className="message-menu-overlay" onClick={onClose}
     onContextMenu={event=>event.preventDefault()}
     onKeyDown={event=>{if(event.key==='Escape')onClose();}}>
     <div className="whatsapp-context" role="dialog" aria-modal="true" tabIndex={-1}
       aria-label="Reaccionar al mensaje" style={{left,top,width}}
       onClick={event=>event.stopPropagation()}>
       <div className="whatsapp-reactions">
         {(['👍','❤️','😂'] as ChatEmoji[]).map(emoji=>
           <button type="button" key={emoji} aria-label={emoji}
             aria-pressed={reactions.some(r=>r.messageSeq===message.seq&&
               r.actorId===actorId&&r.emoji===emoji)}
             disabled={connection!=='en vivo'}
             onContextMenu={event=>event.preventDefault()}
             onClick={event=>{
               startShower(emoji,{x:event.clientX||left+width/2,
                 y:event.clientY||top+25});
               onReact(message,emoji);
             }}>{emoji}</button>)}
       </div>
     </div>
   </div>}
 </>;
}
