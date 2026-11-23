import {useEffect,useRef,useState,type MouseEvent} from 'react';
import type {StoryEmoji,MemberStory} from '@havana/shared';
import StoryVoiceRecorder from './StoryVoiceRecorder';
import {useStoryConversation} from './useStoryConversation';
import type {StoryReactionBurst} from './StoryReactionShower';

type Props={story:MemberStory;token:string;myId?:string|undefined;refreshVersion:number;
 onPause:(paused:boolean)=>void;onBurst:(burst:StoryReactionBurst)=>void};

// A two-row overlay ON the photo, never a separate Chat-like panel.
// Comments expand only on request and remain publicly readable by the team.
export default function StoryConversationPanel({story,token,myId,refreshVersion,onPause,onBurst}:Props){
 const data=useStoryConversation(token,story.id,refreshVersion);
 const [draft,setDraft]=useState('');
 const [expanded,setExpanded]=useState(false);
 const [expandedReaction,setExpandedReaction]=useState<StoryEmoji|null>(null);
 const isOwner=story.actorId===myId;
 const [recording,setRecording]=useState(false);
 const [typing,setTyping]=useState(false);
 const [listening,setListening]=useState(false);
 const serial=useRef(0);
 const comments=data.conversation?.comments||[];
 const reactionDetails=data.conversation?.reactionDetails||[];
 useEffect(()=>{
  setDraft('');setExpanded(false);setExpandedReaction(null);setTyping(false);setRecording(false);setListening(false);
 },[story.id]);
 useEffect(()=>{
  onPause(expanded||expandedReaction!==null||typing||recording||listening||data.sending);
  return()=>onPause(false);
 },[expanded,expandedReaction,typing,recording,listening,data.sending,onPause]);
 const send=async()=>{
  if(!draft.trim())return;
  if(await data.postText(draft)){setDraft('');setTyping(false);}
 };
 const react=(event:MouseEvent<HTMLButtonElement>,emoji:StoryEmoji)=>{
  if(isOwner){
   setExpanded(false);
   setExpandedReaction(current=>current===emoji?null:emoji);
   return;
  }
  const bounds=event.currentTarget.getBoundingClientRect();
  onBurst({id:++serial.current,emoji,
   x:bounds.left+bounds.width/2,y:bounds.top+bounds.height/2});
  void data.react(emoji);
 };
 const reactions:StoryEmoji[]=['❤️','👏','😂'];
 return <section className={"hn-story-conversation"+(recording?" is-recording":"")}
  aria-label={'Reacciones y comentarios públicos del estado de '+story.name}>
  {expanded&&<div className="hn-story-comments-sheet" aria-label="Comentarios públicos del equipo">
   <div className="hn-story-sheet-heading">
    <strong>Comentarios del equipo</strong>
    <button type="button" aria-label="Cerrar comentarios"
     onClick={()=>setExpanded(false)}>×</button>
   </div>
   <div className="hn-story-comments" role="log" aria-live="polite">
    {comments.length?comments.map(comment=><div className="hn-story-comment" key={comment.id}>
     <strong>{comment.name}</strong>
     {comment.kind==='text'?<span>{comment.text}</span>:
      comment.voiceUrl?<audio controls preload="none" src={comment.voiceUrl}
       aria-label={'Audio de '+comment.name}
       onPlay={()=>setListening(true)}
       onPause={()=>setListening(false)} onEnded={()=>setListening(false)}/>:
      <span>Audio no disponible</span>}
    </div>):<p className="hn-story-no-comments">Todavía no hay comentarios.</p>}
   </div>
  </div>}
  <div className="hn-story-mini-actions">
   <div className="hn-story-reactions" aria-label="Reacciones">
    {reactions.map(emoji=><button type="button" key={emoji} onClick={e=>react(e,emoji)}
     aria-expanded={isOwner?expandedReaction===emoji:undefined}
     aria-label={isOwner?'Ver quién reaccionó con '+emoji:emoji==='❤️'?'Enviar corazones':emoji==='👏'?'Aplaudir':'Enviar risas'}>
     {emoji}<span>{data.conversation?.reactions[emoji]||''}</span>
    </button>)}
   </div>
   <button type="button" className="hn-story-comments-open" aria-expanded={expanded}
    onClick={()=>{setExpandedReaction(null);setExpanded(v=>!v);}}>
    Comentarios{comments.length?' · '+comments.length:''}
   </button>
  </div>
  {isOwner&&expandedReaction!==null&&!recording&&<div className="hn-story-reaction-details"
    role="region" aria-label={'Personas que reaccionaron con '+expandedReaction}>
    <div className="hn-story-reaction-heading">
     <strong>{expandedReaction} · {data.conversation?.reactions[expandedReaction]||0}</strong>
     <button type="button" onClick={()=>setExpandedReaction(null)} aria-label="Cerrar detalle de reacciones">×</button>
    </div>
    {reactionDetails.filter(item=>item.emoji===expandedReaction).length?
     reactionDetails.filter(item=>item.emoji===expandedReaction).map(item=>
      <div key={item.actorId} className="hn-story-reaction-person">
       <span>{item.name}</span><strong>{item.count>1?'×'+item.count:'×1'}</strong>
      </div>):
     <p className="hn-story-reaction-empty">Todavía no hay reacciones.</p>}
   </div>}
  <form className={"hn-story-composer"+(recording?" is-recording":"")} onSubmit={e=>{e.preventDefault();void send();}}>
   <input value={draft} maxLength={500} onChange={e=>setDraft(e.target.value)}
    onFocus={()=>setTyping(true)} onBlur={()=>setTyping(false)}
    placeholder="Comentar…" aria-label="Escribir comentario público"/>
   <button className="hn-story-send" type="submit" disabled={data.sending||!draft.trim()}
    aria-label="Enviar comentario">➤</button>
   <StoryVoiceRecorder disabled={data.sending} onRecording={setRecording}
    onSend={data.postVoice}/>
  </form>
  <span className="hn-story-sr-only">Todos pueden leer y responder</span>
  {data.error&&<div role="alert" className="hn-story-comment-error">{data.error}</div>}
 </section>;
}
