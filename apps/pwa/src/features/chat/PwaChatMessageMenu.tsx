import {useEffect,useRef,useState,type CSSProperties,type PointerEvent} from 'react';
import {
 makeChatReactionParticles,CHAT_REACTION_BURST_HOLD_MS,CHAT_REACTION_BURST_TICK_MS,
 CHAT_REACTION_BURST_PER_TICK,CHAT_REACTION_BURST_MAX_PARTICLES,
 type ChatReactionParticle,type ChatMessage,type ChatEmoji,type ChatReaction,
} from '@havana/shared';

// One click reacts once. Holding an emoji emits LOCAL animation particles only:
// zero additional reaction, message, WebSocket or persistence operations.
type Props={
 message:ChatMessage|null;actorId:string;connection:string;reactions:ChatReaction[];
 left:number;top:number;width:number;
 onClose:()=>void;onReact:(message:ChatMessage,emoji:ChatEmoji)=>void;
};

export default function PwaChatMessageMenu({message,actorId,connection,reactions,
 left,top,width,onClose,onReact}:Props){
 const [particles,setParticles]=useState<ChatReactionParticle[]>([]);
 const [activeEmoji,setActiveEmoji]=useState<ChatEmoji|null>(null);
 const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const repeatTimer=useRef<ReturnType<typeof setInterval>|null>(null);
 const holdConsumed=useRef(false);
 const nextParticleId=useRef(0);
 const origin=useRef({x:0,y:0});

 const clearTimers=()=>{
   if(holdTimer.current)clearTimeout(holdTimer.current);
   if(repeatTimer.current)clearInterval(repeatTimer.current);
   holdTimer.current=null;
   repeatTimer.current=null;
 };
 const stopBurst=()=>{clearTimers();setActiveEmoji(null);};
 const emit=(emoji:ChatEmoji)=>{
   const next=makeChatReactionParticles(
     emoji,origin.current,{width:window.innerWidth,height:window.innerHeight},
     nextParticleId.current,
   );
   nextParticleId.current+=CHAT_REACTION_BURST_PER_TICK;
   setParticles(before=>[...before,...next].slice(-CHAT_REACTION_BURST_MAX_PARTICLES));
 };
 const beginHold=(emoji:ChatEmoji,event:PointerEvent<HTMLButtonElement>)=>{
   if(connection!=='en vivo')return;
   if(event.pointerType==='mouse'&&event.button!==0)return;
   clearTimers();
   holdConsumed.current=false;
   origin.current={x:event.clientX,y:event.clientY};
   try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* Older Safari */}
   holdTimer.current=setTimeout(()=>{
     holdTimer.current=null;
     holdConsumed.current=true;
     setActiveEmoji(emoji);
     emit(emoji);
     repeatTimer.current=setInterval(()=>emit(emoji),CHAT_REACTION_BURST_TICK_MS);
   },CHAT_REACTION_BURST_HOLD_MS);
 };
 useEffect(()=>{
   setParticles([]);
   return()=>clearTimers();
 },[message?.seq,connection]);

 if(!message)return null;
 return <div className="message-menu-overlay" onClick={onClose}
    onContextMenu={event=>event.preventDefault()}
    onKeyDown={event=>{if(event.key==='Escape')onClose();}}>
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
   <div className="whatsapp-context" role="dialog" aria-modal="true" tabIndex={-1}
     aria-label="Reaccionar al mensaje" style={{left,top,width}}
     onClick={event=>event.stopPropagation()}>
     <div className="whatsapp-reactions">
       {(['👍','❤️','😂'] as ChatEmoji[]).map(emoji=>
         <button type="button" key={emoji} aria-label={emoji}
           className={activeEmoji===emoji?'burst-active':''}
           aria-pressed={reactions.some(r=>r.messageSeq===message.seq&&
             r.actorId===actorId&&r.emoji===emoji)}
           disabled={connection!=='en vivo'}
           onPointerDown={event=>beginHold(emoji,event)}
           onPointerUp={stopBurst}
           onPointerCancel={stopBurst}
           onLostPointerCapture={stopBurst}
           onContextMenu={event=>event.preventDefault()}
           onClick={()=>{
             if(holdConsumed.current){holdConsumed.current=false;return;}
             onReact(message,emoji);
           }}>{emoji}</button>)}
     </div>
   </div>
 </div>;
}
