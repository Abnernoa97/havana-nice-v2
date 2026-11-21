import {useEffect,useRef,useState,type ChangeEvent} from 'react';
import {STORY_BATCH_MAX,type MemberProfile} from '@havana/shared';
import TeamStoriesStrip from '../home/TeamStoriesStrip';
import MemberStoryViewer from './MemberStoryViewer';
import {useMemberStories} from './useMemberStories';
import './stories.css';

type Props={token:string|undefined;displayName:string|undefined;actorId:string|undefined;
 profiles:readonly MemberProfile[];preview:boolean;canEditProfile:boolean;
 onPhotoError:(memberId:string)=>void;refreshVersion:number};
type SelectedPhoto={file:File;url:string};

export default function MemberStories({token,displayName,actorId,profiles,preview,
 canEditProfile,onPhotoError,refreshVersion}:Props){
 const data=useMemberStories(preview?undefined:token,refreshVersion);
 const [viewActor,setViewActor]=useState<string|null>(null);
 const [selected,setSelected]=useState<SelectedPhoto[]>([]);
 const [selectionError,setSelectionError]=useState('');
 const input=useRef<HTMLInputElement|null>(null);
 const urls=useRef<string[]>([]);
 const discard=()=>{
  urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];
  setSelected([]);setSelectionError('');
 };
 useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url));urls.current=[];},[]);
 const pick=(event:ChangeEvent<HTMLInputElement>)=>{
  const files=Array.from(event.currentTarget.files||[]);event.currentTarget.value='';
  if(!files.length)return;
  if(files.length>STORY_BATCH_MAX){
   setSelectionError('Puedes publicar hasta cinco fotografías a la vez.');
   return;
  }
  discard();
  const urlsNew=files.map(file=>URL.createObjectURL(file));
  urls.current=urlsNew;
  setSelected(files.map((file,i)=>({file,url:urlsNew[i]!})));
  data.clearError();
 };
 const publish=async()=>{
  if(!selected.length)return;
  if(await data.publish(selected.map(item=>item.file)))discard();
 };
 const visible=data.stories.filter(story=>story.expiresAt>Date.now());
 const viewing=visible.filter(story=>story.actorId===viewActor);
 return <>
  <input ref={input} type="file" accept="image/*" multiple className="hn-story-file"
   aria-label="Elegir hasta cinco fotos para estados" onChange={pick}/>
  <TeamStoriesStrip displayName={displayName} actorId={actorId} profiles={profiles}
   preview={preview} canEditProfile={canEditProfile} onPhotoError={onPhotoError}
   stories={visible} onStoryPhotoError={data.retryPhoto}
   onOpenStory={setViewActor} onAddStory={()=>{setSelectionError('');input.current?.click();}}/>
  {(data.error||selectionError)&&!selected.length&&
   <p className="hn-story-error" role="status">{selectionError||data.error}</p>}
  {selected.length>0&&<div className="hn-story-overlay" role="dialog" aria-modal="true" aria-label="Publicar estados">
   <div className="hn-story-publish">
    <button type="button" className="hn-story-x" onClick={discard} disabled={data.saving}
     aria-label="Cancelar publicación">×</button>
    <h2>{selected.length===1?'Mi estado':'Mis estados'}</h2>
    <p>{selected.length} {selected.length===1?'foto seleccionada':'fotos seleccionadas'} · 24 horas · 6 segundos por foto</p>
    <div className={'hn-story-preview-grid'+(selected.length===1?' is-single':'')}>
     {selected.map((photo,i)=><div key={photo.url} className="hn-story-preview-item">
      <img src={photo.url} alt={'Foto '+(i+1)+' de '+selected.length}/>
      <span>{i+1}</span>
     </div>)}
    </div>
    {data.error&&<p className="hn-story-error" role="alert">{data.error}</p>}
    {data.saving&&<p className="hn-story-preparing" role="status">
      {data.preparing<selected.length?'Preparando '+data.preparing+' de '+selected.length+'…':'Publicando las fotografías…'}
     </p>}
    <button type="button" onClick={()=>void publish()} disabled={data.saving} className="hn-story-publish-button">
     {data.saving?'Publicando…':selected.length===1?'Publicar estado':'Publicar '+selected.length+' estados'}
    </button>
   </div>
  </div>}
  {viewActor&&viewing.length>0&&<MemberStoryViewer items={viewing} myId={actorId}
   onClose={()=>setViewActor(null)} onDelete={data.remove} onPhotoError={data.retryPhoto}/>}
 </>;
}
