import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import ChatMediaView from './ChatMediaView';
import {adminChatMessages,adminDeleteChatMessage,isAdminUnauthorized,
 type AdminChatMessage,type AdminChatReaction,type AdminChatStreamEvent} from './services/admin-api';

type Props={token:string;connected:boolean;liveEvent:AdminChatStreamEvent|null;onExpired:()=>void};
const bySequence=(previous:AdminChatMessage[],next:AdminChatMessage[])=>{
 const map=new Map(previous.map(m=>[m.seq,m]));
 next.forEach(m=>map.set(m.seq,m));
 return [...map.values()].sort((a,b)=>a.seq-b.seq);
};
const dateTime=(value:string)=>new Date(value).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'});
export default function AdminChatGeneral({token,connected,liveEvent,onExpired}:Props){
 const [messages,setMessages]=useState<AdminChatMessage[]>([]);
 const [reactions,setReactions]=useState<AdminChatReaction[]>([]);
 const [loading,setLoading]=useState(true);
 const [hasMore,setHasMore]=useState(false);
 const [olderBusy,setOlderBusy]=useState(false);
 const [deleting,setDeleting]=useState<number|null>(null);
 const [online,setOnline]=useState<string[]>([]);
 const [typing,setTyping]=useState<{name:string;expiresAt:number}|null>(null);
 const [error,setError]=useState('');
 const scroll=useRef<HTMLDivElement|null>(null);
 const nearBottom=useRef(true);
 const wasInitial=useRef(true);
 const prepend=useRef<{height:number;top:number}|null>(null);
 const live=useRef(true);
 const removedSeq=useRef<Set<number>>(new Set());
 const load=useCallback(async()=>{
  try{
   const result=await adminChatMessages(token);
   if(!live.current)return;
   // The newest server page is authoritative; do not restore already-erased bubbles.
   setMessages(old=>{
    const newest=result.messages.at(-1)?.seq??0;
    const oldest=result.messages[0]?.seq??Infinity;
    const retained=old.filter(m=>!m.deletedAt&&!removedSeq.current.has(m.seq)
      &&(m.seq<oldest||m.seq>newest));
    return bySequence(retained,result.messages.filter(m=>!m.deletedAt&&!removedSeq.current.has(m.seq)));
   });
   setReactions(old=>[...old.filter(r=>!result.messages.some(m=>m.seq===r.messageSeq)),...result.reactions]);
   setHasMore(result.hasMore);
   setError('');
  }catch(reason){
   if(!live.current)return;
   if(isAdminUnauthorized(reason))onExpired();
   else setError('Conexión interrumpida. El historial cargado permanece en pantalla.');
  }finally{if(live.current)setLoading(false);}
 },[token,onExpired]);
 useEffect(()=>{
  live.current=true;
  void load();
  const onResume=()=>{if(!document.hidden&&navigator.onLine)void load();};
  document.addEventListener('visibilitychange',onResume);
  window.addEventListener('online',onResume);
  return()=>{
   live.current=false;
   document.removeEventListener('visibilitychange',onResume);
   window.removeEventListener('online',onResume);
  };
 },[load]);
 useEffect(()=>{if(connected&&!loading)void load();},[connected,load]);
 useEffect(()=>{
  if(!liveEvent)return;
  if(liveEvent.type==='admin.chat.message'||liveEvent.type==='admin.chat.updated'){
   if(!removedSeq.current.has(liveEvent.message.seq))
    setMessages(old=>bySequence(old,[liveEvent.message]).filter(m=>!m.deletedAt));
  }else if(liveEvent.type==='admin.chat.deleted'){
   removedSeq.current.add(liveEvent.seq);
   setMessages(old=>old.filter(m=>m.seq!==liveEvent.seq&&!m.deletedAt)
     .map(m=>m.replyToSeq===liveEvent.seq?{...m,replyToSeq:null}:m));
   setReactions(old=>old.filter(r=>r.messageSeq!==liveEvent.seq));
  }else if(liveEvent.type==='admin.chat.reaction'){
   const {messageSeq,actorId,emoji,active}=liveEvent;
   setReactions(old=>{
    const rest=old.filter(r=>!(r.messageSeq===messageSeq&&r.actorId===actorId&&r.emoji===emoji));
    return active?[...rest,{messageSeq,actorId,emoji}]:rest;
   });
  }else if(liveEvent.type==='admin.chat.presence'){
   setOnline(liveEvent.users.map(u=>u.displayName));
  }else if(liveEvent.type==='admin.chat.typing'){
   setTyping(liveEvent.active?{name:liveEvent.senderName,expiresAt:liveEvent.expiresAt}:null);
  }
 },[liveEvent]);
 useEffect(()=>{
  if(!typing)return;
  const timer=window.setTimeout(()=>setTyping(null),Math.max(0,typing.expiresAt-Date.now()));
  return()=>window.clearTimeout(timer);
 },[typing]);
 useLayoutEffect(()=>{
  const node=scroll.current;
  if(!node)return;
  if(prepend.current){
   const old=prepend.current;prepend.current=null;
   node.scrollTop=old.top+node.scrollHeight-old.height;
  }else if(wasInitial.current||nearBottom.current){
   node.scrollTop=node.scrollHeight;
   wasInitial.current=false;
  }
 },[messages]);
 async function earlier(){
  const node=scroll.current;
  if(olderBusy||!hasMore||!messages.length||!node)return;
  prepend.current={height:node.scrollHeight,top:node.scrollTop};
  setOlderBusy(true);
  try{
   const data=await adminChatMessages(token,messages[0]!.seq);
   setMessages(old=>bySequence(data.messages.filter(m=>!m.deletedAt&&!removedSeq.current.has(m.seq)),old)
    .filter(m=>!m.deletedAt&&!removedSeq.current.has(m.seq)));
   setReactions(old=>[...data.reactions,...old.filter(r=>!data.messages.some(m=>m.seq===r.messageSeq))]);
   setHasMore(data.hasMore);
  }catch(reason){
   prepend.current=null;
   if(isAdminUnauthorized(reason))onExpired();
   else setError('No se pudieron cargar los mensajes anteriores.');
  }finally{setOlderBusy(false);}
 }
 async function erase(message:AdminChatMessage){
  if(deleting!==null||message.deletedAt)return;
  if(!window.confirm('¿Eliminar el mensaje de '+message.senderName+' del Chat de todos?'))return;
  setDeleting(message.seq);setError('');
  try{
   const result=await adminDeleteChatMessage(token,message.seq);
   removedSeq.current.add(result.seq);
   setMessages(old=>old.filter(m=>m.seq!==result.seq&&!m.deletedAt)
     .map(m=>m.replyToSeq===result.seq?{...m,replyToSeq:null}:m));
   setReactions(old=>old.filter(r=>r.messageSeq!==message.seq));
  }catch(reason){
   if(isAdminUnauthorized(reason))onExpired();
   else setError(reason instanceof Error?reason.message:'Error al eliminar el mensaje');
  }finally{setDeleting(null);}
 }
 return <section className="a-panel a-chat-general" aria-label="Chat general de todos los músicos">
  <header className="a-chat-general-head">
   <div><h2>Chat general</h2>
    <p className="a-detail">Una sola conversación con todos los músicos. Vista y moderación, sin enviar mensajes.</p></div>
   <div className="a-chat-general-status">
    <small>{connected?'● Sincronizado en vivo':'○ Reconectando'}</small>
    <button type="button" disabled={loading} onClick={()=>void load()}>Actualizar</button>
   </div>
  </header>
  <p className="a-chat-general-presence" aria-live="polite">
   {online.length?'Conectados: '+online.join(', '):'Sin músicos conectados o conexión pendiente'}
  </p>
  {error&&<p className="a-admin-error" role="alert">{error}</p>}
  <div ref={scroll} className="a-chat-general-history" aria-label="Mensajes de todos los músicos"
   onScroll={e=>{
    const n=e.currentTarget;nearBottom.current=n.scrollHeight-n.scrollTop-n.clientHeight<85;
   }}>
   {hasMore&&<button type="button" className="a-chat-older" disabled={olderBusy}
    onClick={()=>void earlier()}>{olderBusy?'Cargando…':'Ver mensajes anteriores'}</button>}
   {loading&&!messages.length?<p className="a-chat-wait">Cargando historial…</p>:
    !messages.length?<p className="a-chat-wait">Todavía no hay mensajes.</p>:
    messages.map((m,i)=>{
     const previous=messages[i-1];
     const adjacent=previous&&previous.senderId===m.senderId&&
       Date.parse(m.sentAt)-Date.parse(previous.sentAt)<300000;
     const icons=reactions.filter(r=>r.messageSeq===m.seq);
     return <div className="a-chat-message-row" key={m.seq}>
      <article className="a-chat-bubble">
       {!adjacent&&<strong className="a-chat-author">{m.senderName}</strong>}
       {m.replyToSeq!==null&&<small className="a-chat-reply">Responde al mensaje #{m.replyToSeq}</small>}
       {!m.media&&<p>{m.text}</p>}
       {m.media&&<ChatMediaView media={m.media} token={token}/>}
       <div className="a-chat-message-footer">
        <time dateTime={m.sentAt}>{dateTime(m.sentAt)}</time>
        {m.editedAt&&<span> · editado</span>}
        {icons.length>0&&<span className="a-chat-reactions">{icons.map(r=>r.emoji).join(' ')}</span>}
       </div>
      </article>
      {<button type="button" className="a-chat-delete"
       title="Eliminar para todos" aria-label={'Eliminar mensaje de '+m.senderName}
       disabled={deleting!==null} onClick={()=>void erase(m)}>
       <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" aria-hidden="true">
        <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 4v7m4-7v7"/>
       </svg>
      </button>}
     </div>;
    })}
  </div>
  {typing&&<p className="a-chat-typing">{typing.name} está escribiendo…</p>}
  <p className="a-chat-viewer-note">Administrador: historial del Chat de los músicos. Fotos y videos privados en HAVANA NICE R2.</p>
 </section>;
}
