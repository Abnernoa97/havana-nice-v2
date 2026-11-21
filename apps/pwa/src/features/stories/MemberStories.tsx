import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import type {MemberProfile} from '@havana/shared';
import TeamStoriesStrip from '../home/TeamStoriesStrip';
import MemberStoryViewer from './MemberStoryViewer';
import {useMemberStories} from './useMemberStories';
import './stories.css';

type Props={token:string|undefined;displayName:string|undefined;actorId:string|undefined;
 profiles:readonly MemberProfile[];preview:boolean;canEditProfile:boolean;
 onPhotoError:(memberId:string)=>void;refreshVersion:number};

export default function MemberStories({token,displayName,actorId,profiles,preview,
 canEditProfile,onPhotoError,refreshVersion}:Props){
 const data=useMemberStories(preview?undefined:token,refreshVersion);
 const [viewActor,setViewActor]=useState<string|null>(null);
 const [selected,setSelected]=useState<{file:File;url:string}|null>(null);
 const input=useRef<HTMLInputElement|null>(null);
 const selectedRef=useRef<string|null>(null);
 const discard=()=>{
  if(selectedRef.current){URL.revokeObjectURL(selectedRef.current);selectedRef.current=null;}
  setSelected(null);
 };
 useEffect(()=>()=>{if(selectedRef.current)URL.revokeObjectURL(selectedRef.current);},[]);
 const pick=(event:ChangeEvent<HTMLInputElement>)=>{
  const file=event.currentTarget.files?.[0];event.currentTarget.value='';
  if(!file)return;
  if(selectedRef.current)URL.revokeObjectURL(selectedRef.current);
  const url=URL.createObjectURL(file);selectedRef.current=url;
  setSelected({file,url});data.clearError();
 };
 const publish=async()=>{
  if(!selected)return;
  if(await data.publish(selected.file))discard();
 };
 const visible=data.stories.filter(story=>story.expiresAt>Date.now());
 const viewing=visible.filter(story=>story.actorId===viewActor);
 return <>
  <input ref={input} type="file" accept="image/*" className="hn-story-file" aria-label="Elegir foto para estado" onChange={pick}/>
  <TeamStoriesStrip displayName={displayName} actorId={actorId} profiles={profiles}
   preview={preview} canEditProfile={canEditProfile} onPhotoError={onPhotoError}
   stories={visible} onOpenStory={setViewActor} onAddStory={()=>input.current?.click()}/>
  {data.error&&!selected&&<p className="hn-story-error" role="status">{data.error}</p>}
  {selected&&<div className="hn-story-overlay" role="dialog" aria-modal="true" aria-label="Publicar estado">
   <div className="hn-story-publish">
    <button type="button" className="hn-story-x" onClick={discard} disabled={data.saving} aria-label="Cancelar estado">×</button>
    <h2>Mi estado</h2>
    <p>Esta foto estará visible durante 24 horas.</p>
    <img src={selected.url} alt="Vista previa del estado"/>
    {data.error&&<p className="hn-story-error" role="alert">{data.error}</p>}
    <button type="button" onClick={()=>void publish()} disabled={data.saving} className="hn-story-publish-button">
     {data.saving?'Publicando…':'Publicar estado'}
    </button>
   </div>
  </div>}
  {viewActor&&viewing.length>0&&<MemberStoryViewer items={viewing} myId={actorId}
   onClose={()=>setViewActor(null)} onDelete={data.remove} onPhotoError={data.retryPhoto}/>}
 </>;
}
