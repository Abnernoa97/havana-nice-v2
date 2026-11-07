import {useEffect,useMemo,useRef,useState} from 'react';
import {PageFlip} from 'page-flip';
import {bookMediaUrl,type BookPage} from '@havana/shared';
import './book.css';

type FlipEvent={data:number|string};
type FlipHandle={
 flipNext:(corner:'top'|'bottom')=>void;flipPrev:(corner:'top'|'bottom')=>void;
 destroy:()=>void;on:(event:string,listener:(e:FlipEvent)=>void)=>void;
 getCurrentPageIndex:()=>number;
};
export default function BookReader({pages}:{pages:BookPage[]}){
 const [mode,setMode]=useState<'flip'|'scroll'>('flip');
 const [page,setPage]=useState(0);
 const [error,setError]=useState(false);
 const [orientation,setOrientation]=useState<'portrait'|'landscape'>('portrait');
 const mountRef=useRef<HTMLDivElement|null>(null);
 const sourceRef=useRef<HTMLDivElement|null>(null);
 const instance=useRef<FlipHandle|null>(null);
 // Only source-page changes recreate the engine. A flip/swipe reuses one book.
 const signature=useMemo(()=>pages.map(x=>x.id+':'+x.url+':'+x.fit).join('|'),[pages]);
 const count=pages.length+2;
 useEffect(()=>{
  setPage(0);
  if(mode!=='flip'||!mountRef.current||!sourceRef.current||!pages.length)return;
  const mount=mountRef.current,source=sourceRef.current;
  let flip:FlipHandle|null=null;
  const host=document.createElement('div');
  host.className='hn-book-flip-host';
  host.replaceChildren(...Array.from(source.children).map(node=>node.cloneNode(true)));
  mount.replaceChildren(host);
  try{
   flip=new PageFlip(host,{
    width:410,height:580,size:'stretch',minWidth:270,maxWidth:560,
    minHeight:382,maxHeight:792,drawShadow:true,maxShadowOpacity:0.72,
    flippingTime:950,usePortrait:true,autoSize:true,showCover:true,
    mobileScrollSupport:false,swipeDistance:25,showPageCorners:true,
    disableFlipByClick:false
   }) as FlipHandle;
   flip.loadFromHTML(host.querySelectorAll<HTMLElement>('.hn-book-leaf'));
   flip.on('flip',e=>setPage(Number(e.data)||0));
   flip.on('changeOrientation',e=>setOrientation(e.data==='landscape'?'landscape':'portrait'));
   instance.current=flip;setError(false);
  }catch{
   setError(true);setMode('scroll');
  }
  return()=>{instance.current=null;try{flip?.destroy();}catch{}mount.replaceChildren();};
 },[mode,signature,pages.length]);
 const flip=(dir:'next'|'prev')=>{
  if(!instance.current)return;
  if(dir==='next'&&page<count-1)instance.current.flipNext('bottom');
  if(dir==='prev'&&page>0)instance.current.flipPrev('bottom');
 };
 useEffect(()=>{
  if(mode!=='flip')return;
  const key=(event:KeyboardEvent)=>{
   if(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement)return;
   if(event.key==='ArrowRight')flip('next');
   if(event.key==='ArrowLeft')flip('prev');
  };
  window.addEventListener('keydown',key);
  return()=>window.removeEventListener('keydown',key);
 },[mode,page,count]);
 if(!pages.length)return <div className="hn-book-empty">Todavía no hay páginas publicadas. Las imágenes aparecerán cuando Administración las añada.</div>;
 const first=bookMediaUrl(pages[0].url);
 const leaves=<>
  <div className="hn-book-leaf hn-book-front" data-density="hard">
   {first?<img src={first} alt="" decoding="async" fetchPriority="high"/>:null}
   <div className="hn-book-cover-shade"/>
   <div className="hn-book-cover-heading"><small>THE PRIVATE EDITION</small><strong>HAVANA<br/>NICE</strong></div>
   <div className="hn-book-cover-footer">BOOK HAVANA NICE <span>01 / EDITION</span></div>
  </div>
  {pages.map((item,i)=>{
   const image=bookMediaUrl(item.url);
   return <div key={item.id} className={'hn-book-leaf hn-book-photo '+(item.fit==='contain'?'hn-book-contain':'hn-book-cover-fit')} data-density="soft">
    {image?<img src={image} alt={'Página '+(i+1)+' de BOOK HAVANA NICE'} loading={i<2?'eager':'lazy'} decoding="async"/>:null}
    <span className="hn-book-folio">{String(i+1).padStart(2,'0')}</span>
   </div>;
  })}
  <div className="hn-book-leaf hn-book-back" data-density="hard">
   <small>HAVANA NICE</small><strong>THE END.</strong><span>LIVE MUSIC · MADE PERSONAL</span>
  </div>
 </>;
 return <section className="hn-book-reader" aria-label="BOOK HAVANA NICE · revista interactiva">
  <div className="hn-book-switch" role="group" aria-label="Modo de lectura">
   <button type="button" aria-pressed={mode==='flip'} onClick={()=>setMode('flip')}>Revista 3D</button>
   <button type="button" aria-pressed={mode==='scroll'} onClick={()=>setMode('scroll')}>Desplazar</button>
  </div>
  {mode==='flip'&&!error?<div className="hn-book-stage"><div className="hn-book-mount" ref={mountRef}/></div>:null}
  {mode==='scroll'?<div className="hn-book-scroll">{leaves}</div>:null}
  <div className="hn-book-source" aria-hidden="true" ref={sourceRef}>{leaves}</div>
  {mode==='flip'&&!error?<div className="hn-book-controls">
   <button type="button" onClick={()=>flip('prev')} disabled={page===0} aria-label="Página anterior">‹</button>
   <div className="hn-book-counter"><strong>{String(page+1).padStart(2,'0')} <span>/</span> {String(count).padStart(2,'0')}</strong>
    <div className="hn-book-progress"><span style={{width:((page+1)/count*100)+'%'}}/></div>
    <small>{orientation==='landscape'?'Libro abierto · dos páginas':'Arrastra la esquina para pasar la página'}</small>
   </div>
   <button type="button" onClick={()=>flip('next')} disabled={page>=count-1} aria-label="Página siguiente">›</button>
  </div>:null}
 </section>;
}
