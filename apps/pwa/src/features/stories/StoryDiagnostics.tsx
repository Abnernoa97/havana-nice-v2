import {useEffect,useRef,useState} from 'react';

// Local-only measurements: never transmit grants, tokens, URLs, images,
// member names or browser identifiers. No synthetic network requests.
type Snapshot={
 elapsed:number;loaded:number|null;network:number|null;complete:boolean;
 pixels:string;overlay:boolean;visible:boolean;peakLag:number;audio:number;
 imageRequests:number;audioRequests:number;bootAge:number;controlled:boolean;
};
function latestResource(src:string){
 if(!src||src.startsWith('blob:'))return null;
 try{
  const entries=performance.getEntriesByName(src,'resource');
  const entry=entries[entries.length-1] as PerformanceResourceTiming|undefined;
  return entry&&Number.isFinite(entry.duration)?Math.round(entry.duration):null;
 }catch{return null;}
}
const sendIsolation=(active:boolean)=>window.dispatchEvent(new CustomEvent<boolean>('hn-local-diagnostic-audio',{detail:active}));
export default function StoryDiagnostics({open,storyId,source,ready,failed,onClose}:{
 open:boolean;storyId:string;source:string;ready:boolean;failed:boolean;onClose:()=>void;
}){
 const timing=useRef({storyId:'',source:'',start:0,loaded:null as number|null,switches:0});
 const peakLag=useRef(0);
 const [isolated,setIsolated]=useState(false);
 const [sample,setSample]=useState<Snapshot|null>(null);
 // Measure from the first viewer render, even if diagnostics is opened later.
 if(timing.current.storyId!==storyId){
  timing.current={storyId,source,start:performance.now(),loaded:null,switches:0};
 }else if(timing.current.source!==source){
  timing.current.source=source;timing.current.switches++;
 }
 if(ready&&timing.current.loaded===null)timing.current.loaded=Math.round(performance.now()-timing.current.start);
 useEffect(()=>()=>{
  sendIsolation(false);
 },[]);
 useEffect(()=>{
  if(!open){setIsolated(false);sendIsolation(false);return;}
  peakLag.current=0;
  let previous=performance.now();
  const read=()=>{
   const now=performance.now();
   peakLag.current=Math.max(peakLag.current,Math.max(0,Math.round(now-previous-200)));
   previous=now;
   const photo=document.querySelector<HTMLImageElement>('.hn-story-photo');
   const rect=photo?.getBoundingClientRect();
   const style=photo?getComputedStyle(photo):null;
   let imageRequests=0,audioRequests=0;
   for(const entry of performance.getEntriesByType('resource')){
    if(entry.startTime<timing.current.start)continue;
    // Only classify locally. No resource addresses are displayed or retained.
    if(entry.name.includes('/api/stories/photo/'))imageRequests++;
    if(entry.name.includes('/api/audio/'))audioRequests++;
   }
   setSample({elapsed:Math.round(now-timing.current.start),loaded:timing.current.loaded,
    network:latestResource(source),complete:photo?.complete===true,
    pixels:photo?photo.naturalWidth+' × '+photo.naturalHeight:'sin elemento',
    overlay:!!document.querySelector('.hn-story-loading'),
    visible:!!rect&&rect.width>0&&rect.height>0&&style?.visibility!=='hidden'&&style?.display!=='none'&&style?.opacity!=='0',
    peakLag:peakLag.current,audio:document.querySelectorAll('audio').length,
    imageRequests,audioRequests,bootAge:Math.round(now/1000),
    controlled:!!navigator.serviceWorker?.controller});
  };
  read();
  const interval=window.setInterval(read,200);
  return()=>window.clearInterval(interval);
 },[open,source,ready,failed,isolated]);
 if(!open)return null;
 const toggle=()=>{
  const next=!isolated;setIsolated(next);sendIsolation(next);peakLag.current=0;
 };
 const ms=(n:number|null)=>n===null?'sin dato':n+' ms';
 return <aside role="region" aria-label="Diagnóstico local" style={{
  position:'absolute',zIndex:40,top:'calc(83px + env(safe-area-inset-top))',
  left:12,right:12,padding:12,borderRadius:10,background:'rgba(12,23,19,.96)',
  color:'white',font:'12px/1.5 monospace',boxShadow:'0 2px 12px #0008'}}>
  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
   <strong>DIAGNÓSTICO HN · D2</strong><button type="button" onClick={onClose}>Cerrar ×</button>
  </div>
  <div>Fuente: {source.startsWith('blob:')?'local':source?'red':'ninguna'} · {failed?'error':ready?'lista':'esperando'}</div>
  {sample&&<>
   <div>Tiempo total hasta carga: {ms(sample.loaded)} · cambios {timing.current.switches}</div>
   <div>Recurso navegador: {ms(sample.network)}</div>
   <div>Tiempo en estado: {sample.elapsed} ms</div>
   <div>Imagen: {sample.pixels} · complete {sample.complete?'sí':'no'}</div>
   <div>Elemento visible: {sample.visible?'sí':'no'} · aviso {sample.overlay?'sí':'no'}</div>
   <div>Retraso máx. interfaz: {sample.peakLag} ms</div>
   <div>Solicitudes desde apertura: foto {sample.imageRequests} / audio {sample.audioRequests}</div>
   <div>Audio DOM: {sample.audio} · inicio hace {sample.bootAge}s · SW {sample.controlled?'sí':'no'}</div>
  </>}
  <button type="button" onClick={toggle} style={{marginTop:6,padding:'6px 8px'}}>
   {isolated?'Restaurar audio':'Aislar audio (prueba)'}</button>
  <div style={{fontSize:10,opacity:.8}}>Pasa al siguiente estado para comparar. Solo datos locales. Cerrar restablece Audio.</div>
 </aside>;
}
