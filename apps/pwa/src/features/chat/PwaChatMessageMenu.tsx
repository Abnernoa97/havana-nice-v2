import type {ChatMessage,ChatEmoji,ChatReaction} from '@havana/shared';
// Presentation only: the single App owner keeps edit/delete permissions and network actions.
type Props={
 message:ChatMessage|null;actorId:string;connection:string;reactions:ChatReaction[];
 canEdit:boolean;canDelete:boolean;left:number;top:number;width:number;
 onClose:()=>void;onReact:(message:ChatMessage,emoji:ChatEmoji)=>void;
 onReply:(message:ChatMessage)=>void;onEdit:(message:ChatMessage)=>void;
 onDelete:(message:ChatMessage)=>void;
};
export default function PwaChatMessageMenu({message,actorId,connection,reactions,canEdit,canDelete,
 left,top,width,onClose,onReact,onReply,onEdit,onDelete}:Props){
 if(!message)return null;
 return {message&&<div className="message-menu-overlay"
              onClick={()=>onClose()} onKeyDown={event=>{
                if(event.key==='Escape')onClose();
              }}>
            <div className="whatsapp-context" role="dialog" aria-modal="true" tabIndex={-1}
              aria-label="Acciones del mensaje" style={{
                left,top,width,
              }} onClick={event=>event.stopPropagation()}>
              <div className="whatsapp-reactions">
                {(['👍','❤️','😂'] as ChatEmoji[]).map(emoji=>
                  <button type="button" key={emoji} aria-label={emoji}
                    aria-pressed={reactions.some(r=>r.messageSeq===message.seq&&
                      r.actorId===actorId&&r.emoji===emoji)}
                    disabled={connection!=='en vivo'}
                    onClick={()=>{onReact(message,emoji);}}>
                    {emoji}
                  </button>)}
              </div>
              <div className="whatsapp-actions">
                <button type="button" onClick={()=>onReply(message)}>Responder</button>
                {canEdit&&<button type="button" onClick={()=>{
                  const m=message;onClose();onEdit(m);
                }}>Editar</button>}
                {canDelete&&<button type="button" className="whatsapp-delete" onClick={()=>{
                  const m=message;onClose();
                  if(window.confirm('¿Borrar este mensaje para todos?'))onDelete(m);
                }}>Borrar</button>}
              </div>
            </div>
          </div>};
}
