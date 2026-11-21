import {useEffect,useRef,useState,type MouseEvent} from 'react';
import type {StoryEmoji,MemberStory} from '@havana/shared';
import StoryVoiceRecorder from './StoryVoiceRecorder';
import {useStoryConversation} from './useStoryConversation';
import type {StoryReactionBurst} from './StoryReactionShower';

type Props={story:MemberStory;token:string;refreshVersion:number;
 onPause:(paused:boolean)=>void;onBurst:(burst:StoryReactionBurst)=>void};
export default function StoryConversationPanel({story,token,refreshVersion,onPause,onBurst}:Props){
 const data=useStoryConversation(token,story.id,refreshVersion);
 const [draft,setDraft]=useState('');
 const [expanded,setExpanded]=useState(false);
 const [recording,setRecording]=useState(false);
 const [typing,setTyping]=useState(false);
 const serial=useRef(0);
 const comments=data.conversation?.comments||[];
 const shown=expanded?comments:comments.slice(-3);
 useEffect(()=>{setDraft('');setExpanded(false);setTyping(false);setRecording(false);},[story.id]);
 useEffect(()=>{
  onPause(expanded||typing||recording||data.sending);
  return()=>onPause(false);
 },[expanded,typing,recording,data.sending,onPause]);
 const send=async()=>{
  if(!draft.trim())return;
  if(await data.postText(draft)){setDraft('');setTyping(false);}
 };
 const react=(event:MouseEvent<HTMLButtonElement>,emoji:StoryEmoji)=>{
  const bounds=event.currentTarget.getBoundingClientRect();
  onBurst({id:++serial.current,emoji,x:bounds.left+bounds.width/2,
   y:bounds.top+bounds.height/2});
  void data.react(emoji);
 };
 return <section className="hn-story-conversation" aria-label={'Conversación pública del estado de '+story.name}>
  <div className="hn-story-conversation-heading">
   <strong>Equipo HAVANA NICE</strong>
   <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>
    {expanded?'Reducir conversación':comments.length>3?'Ver '+comments.length+' mensajes':'Conversación'}
   </button>
  </div>
  <div className={'hn-story-comments'+(expanded?' expanded':'')} role="log" aria-live="polite">
   {shown.length?shown.map(item=><div key={item.id} className="hn-story-comment">
    <strong>{item.name}</strong>
    {item.kind==='text'?<span>{item.text}</span>:
     item.voiceUrl?<audio controls preload="none" src={item.voiceUrl}
      aria-label={'Audio de '+item.name}/>:
     <span>Audio no disponible</span>}
   </div>):<p className="hn-story-no-comments">Sé el primero en comentar este estado.</p>}
  </div>
  <div className="hn-story-reactions">
   <button type="button" aria-label="Enviar corazones" onClick={e=>react(e,'❤️')}>
    ❤️ <span>{data.conversation?.reactions['❤️']||''}</span>
   </button>
   <button type="button" aria-label="Aplaudir" onClick={e=>react(e,'👏')}>
    👏 <span>{data.conversation?.reactions['👏']||''}</span>
   </button>
   <span className="hn-story-public-label">Todos pueden leer y responder</span>
  </div>
  <form className="hn-story-composer" onSubmit={event=>{event.preventDefault();void send();}}>
   <input value={draft} maxLength={500} onChange={e=>setDraft(e.target.value)}
    onFocus={()=>setTyping(true)} onBlur={()=>{if(!draft.trim())setTyping(false);}}
    placeholder="Escribe al equipo…" aria-label="Escribir comentario público"/>
   <button type="submit" disabled={data.sending||!draft.trim()}
    aria-label="Enviar comentario al equipo">Enviar</button>
   <StoryVoiceRecorder disabled={data.sending}
    onRecording={setRecording} onSend={data.postVoice}/>
  </form>
  {data.error&&<div role="alert" className="hn-story-comment-error">{data.error}</div>}
 </section>;
}
