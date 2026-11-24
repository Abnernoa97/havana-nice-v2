import {memo} from 'react';

// One real JPEG image. Safari can paint progressive bytes as they arrive;
// an extra fetch(), Blob conversion and decode() never gate first paint.
export default memo(function StoryPhotoSurface({id,name,url,failed,loaded,onReady,onError}:{
 id:string;name:string;url:string;failed:boolean;loaded:boolean;
 onReady:(id:string,url:string)=>void;onError:(id:string,url:string)=>void;
}){
 return <div className="hn-story-canvas" aria-label="Fotografía del estado">
  {failed?<div className="hn-story-unavailable">No se pudo cargar esta fotografía.</div>:<>
   {url&&<img className="hn-story-photo" src={url} alt={'Estado de '+name}
    loading="eager" decoding="async" fetchPriority="high"
    onLoad={()=>onReady(id,url)} onError={()=>onError(id,url)}/>}
   {!loaded&&<div className="hn-story-loading" role="status">Cargando fotografía…</div>}
  </>}
 </div>;
});
