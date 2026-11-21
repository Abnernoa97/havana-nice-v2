import {memo} from 'react';

// The canvas never re-renders for timers, keyboard, reactions, voice or comments.
// It changes only when the selected story ID / image truly changes.
export default memo(function StoryPhotoSurface({id,name,url,failed}:{
 id:string;name:string;url:string;failed:boolean;
}){
 return <div className="hn-story-canvas" aria-label={'Fotografía del estado'}>
  {failed?<div className="hn-story-unavailable">No se pudo cargar esta fotografía.</div>:
   <div key={id} className="hn-story-photo" role="img"
    aria-label={'Estado de '+name} style={{backgroundImage:'url("'+url+'")'}}/>}
 </div>;
});
