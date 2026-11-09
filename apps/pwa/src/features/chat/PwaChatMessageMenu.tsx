import type {ChatMessage,ChatEmoji,ChatReaction} from '@havana/shared';
// Long press offers reactions only. Reply is the bubble's swipe gesture.
type Props={
 message:ChatMessage|null;actorId:string;connection:string;reactions:ChatReaction[];
 left:number;top:number;width:number;
 onClose:()=>void;onReact:(message:ChatMessage,emoji:ChatEmoji)=>void;
};
export default function PwaChatMessageMenu({message,actorId,connection,reactions,
 left,top,width,onClose,onReact}:Props){
 if(!message)return null;
 return <div className="message-menu-overlay" onClick={onClose}
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
           onClick={()=>onReact(message,emoji)}>{emoji}</button>)}
     </div>
   </div>
 </div>;
}
