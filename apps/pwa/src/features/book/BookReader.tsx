import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {PageFlip} from 'page-flip';
import {bookMediaUrl,type BookPage} from '@havana/shared';
import './book.css';

type FlipEvent={data:number|string};
type BookEngine={
 flipNext:(corner:'top'|'bottom')=>void;
 flipPrev:(corner:'top'|'bottom')=>void;
 turnToPage:(page:number)=>void;
 destroy:()=>void;
 updateFromHtml:(pages:NodeListOf<HTMLElement>|HTMLElement[])=>void;
 loadFromHTML:(pages:NodeListOf<HTMLElement>|HTMLElement[])=>void;
 getCurrentPageIndex:()=>number;
 getPageCollection:()=>{getCurrentSpreadIndex:()=>number;getSpreadIndexByPage:(i:number)=>number};
 on:(event:string,listener:(event:FlipEvent)=>void)=>void;
};

/**
 * One persistent StPageFlip engine. The source pages stay outside the renderer
 * (as in Quotes), but only *real editorial changes* update the DOM pages.
 * A notification or expiring media grant must never tear down the animation.
 */
export default function BookReader({pages}:{pages:BookPage[]}){
 const [mode,setMode]=useState<'flip'|'scroll'>('flip');
 const [page,setPage]=useState(0);
 const [turning,setTurning]=useState(false);
 const [failure,setFailure]=useState(false);
 const [orientation,setOrientation]=useState<'portrait'|'landscape'>('portrait');
 const mountRef=useRef<HTMLDivElement|null>(null);
 const sourceRef=useRef<HTMLDivElement|null>(null);
 const instance=useRef<BookEngine|null>(null);
 const structureRef=useRef('');
 const busyRef=useRef(false);
 const pendingImages=useRef<BookPage[]|null>(null);
 const count=pages.length+1; // The first Admin image is the cover, never repeated.
 const countRef=useRef(count);
 countRef.current=count;
 const present=pages.length>0;
 const structure=useMemo(()=>pages.map(p=>p.id+':'+p.fit).join('|'),[pages]);
 const [canPrev,setCanPrev]=useState(false);
 const [canNext,setCanNext]=useState(count>1);

 const syncControls=useCallback((flip:BookEngine|null)=>{
  if(!flip)return;
  const current=flip.getCurrentPageIndex();
  const collection=flip.getPageCollection();
  const spread=collection.getCurrentSpreadIndex();
  setPage(current);
  setCanPrev(spread>0);
  setCanNext(spread<collection.getSpreadIndexByPage(Math.max(0,countRef.current-1)));
 },[]);

 const syncMedia=useCallback((data:BookPage[])=>{
  const mount=mountRef.current;
  if(!mount)return;
  const images=new Map(data.map(item=>[item.id,bookMediaUrl(item.url)]));
  mount.querySelectorAll<HTMLImageElement>('img[data-book-id]').forEach(img=>{
   const next=images.get(img.dataset.bookId||'');
   if(next&&img.src!==next)img.src=next;
  });
  const cover=mount.querySelector<HTMLImageElement>('img[data-book-cover]');
  const next=bookMediaUrl(data[0]?.url);
  if(cover&&next&&cover.src!==next)cover.src=next;
 },[]);

 // The library was previously given autoSize:true. It changes wrapper padding
 // from a single-page to a double-page ratio during a turn, moving the entire
 // screen. The stage now owns a fixed height; the library only draws inside it.
 useEffect(()=>{
  if(mode!=='flip'||!present||!mountRef.current||!sourceRef.current)return;
  const mount=mountRef.current;
  const host=document.createElement('div');
  host.className='hn-book-flip-host';
  host.replaceChildren(...Array.from(sourceRef.current.children).map(n=>n.cloneNode(true)));
  mount.replaceChildren(host);
  let flip:BookEngine|null=null;
  try{
   flip=new PageFlip(host,{
    width:410,height:580,size:'stretch',minWidth:220,maxWidth:520,
    minHeight:382,maxHeight:735,
    drawShadow:true,maxShadowOpacity:0.72,
    flippingTime:1080,usePortrait:true,autoSize:false,
    showCover:true,mobileScrollSupport:false,swipeDistance:25,
    showPageCorners:false,disableFlipByClick:false
   }) as BookEngine;
   flip.loadFromHTML(host.querySelectorAll<HTMLElement>('.hn-book-leaf'));
   instance.current=flip;
   structureRef.current=structure;
   setPage(0);
   setTurning(false);
   setFailure(false);
   flip.on('flip',event=>{
    if(!instance.current)return;
    setPage(Number(event.data)||0);
    syncControls(instance.current);
   });
   flip.on('changeOrientation',event=>{
    setOrientation(event.data==='landscape'?'landscape':'portrait');
   });
   flip.on('changeState',event=>{
    const busy=event.data==='flipping';
    busyRef.current=busy;
    setTurning(busy);
    if(!busy&&pendingImages.current){
     syncMedia(pendingImages.current);
     pendingImages.current=null;
    }
   });
   syncControls(flip);
  }catch(error){
   console.error('BOOK 3D engine initialization:',error);
   setFailure(true);
   setMode('scroll');
  }
  return()=>{
   instance.current=null;
   busyRef.current=false;
   pendingImages.current=null;
   if(flip){try{flip.destroy();}catch(error){console.warn('BOOK renderer cleanup:',error);}}
   mount.replaceChildren();
  };
 // Lifecycle is intentionally only mode / empty↔nonempty. NEVER a flip, grant
 // refresh, rotation or page-list edit: repeated engines waste RAF/GPU time.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[mode,present]);

 // Change the physical leaves with the library's own updater. This preserves
 // its requestAnimationFrame loop, mounted container, and current session.
 useEffect(()=>{
  const flip=instance.current;
  if(mode!=='flip'||!flip||!sourceRef.current||structureRef.current===structure)return;
  const next=Array.from(sourceRef.current.children).map(n=>n.cloneNode(true) as HTMLElement);
  try{
   busyRef.current=false;
   flip.turnToPage(0);
   flip.updateFromHtml(next);
   structureRef.current=structure;
   syncControls(flip);
   syncMedia(pages);
  }catch(error){
   console.warn('BOOK pages cannot refresh while turning:',error);
  }
 },[mode,structure,pages,syncControls,syncMedia]);

 // A short-lived R2 grant changes the URLs, not the book's pages.
 useEffect(()=>{
  if(busyRef.current){pendingImages.current=pages;return;}
  syncMedia(pages);
 },[pages,syncMedia]);

 // Prime only the upcoming photos, not all 80 high-resolution originals.
 useEffect(()=>{
  if(mode!=='flip')return;
  const images=mountRef.current?.querySelectorAll<HTMLImageElement>('img[data-book-id]');
  if(!images)return;
  for(let i=Math.max(0,page-1);i<Math.min(images.length,page+2);i++){
   const img=images.item(i);
   if(!img)continue;
   img.loading='eager';
   if(typeof img.decode==='function')void img.decode().catch(()=>{});
  }
 },[page,mode,structure]);

 const flip=useCallback((direction:'next'|'prev')=>{
  const engine=instance.current;
  if(!engine||busyRef.current)return;
  const spread=engine.getPageCollection().getCurrentSpreadIndex();
  const last=engine.getPageCollection().getSpreadIndexByPage(count-1);
  if(direction==='next'&&spread<last)engine.flipNext('bottom');
  else if(direction==='prev'&&spread>0)engine.flipPrev('bottom');
 },[count]);
 useEffect(()=>{
  if(mode!=='flip')return;
  const key=(event:KeyboardEvent)=>{
   const target=event.target;
   if(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||
     target instanceof HTMLSelectElement||event.ctrlKey||event.metaKey||event.altKey)return;
   if(event.key==='ArrowRight'){event.preventDefault();flip('next');}
   if(event.key==='ArrowLeft'){event.preventDefault();flip('prev');}
  };
  window.addEventListener('keydown',key);
  return()=>window.removeEventListener('keydown',key);
 },[mode,flip]);

 if(!present)return <div className="hn-book-empty">Todavía no hay páginas publicadas. Las imágenes aparecerán cuando Administración las añada.</div>;
 const cover=bookMediaUrl(pages[0]?.url);
 const leaves=<>
  <div className={'hn-book-leaf hn-book-front'+(pages[0]?.fit==='contain'?' hn-book-contain':'')} data-density="hard">
   {cover?<img src={cover} alt="" data-book-cover="true" loading="eager" decoding="async" fetchPriority="high"/>:null}
   <div className="hn-book-cover-shade"/>
   <div className="hn-book-cover-heading"><small>THE PRIVATE EDITION</small><strong>HAVANA<br/>NICE</strong></div>
   <div className="hn-book-cover-footer">BOOK HAVANA NICE <span>01 / EDITION</span></div>
  </div>
  {pages.slice(1).map((item,i)=>{
   const url=bookMediaUrl(item.url);
   return <div key={item.id} className={'hn-book-leaf hn-book-photo '+(item.fit==='contain'?'hn-book-contain':'hn-book-cover-fit')} data-density="soft">
    {url?<img src={url} data-book-id={item.id} alt={'Página '+(i+2)+' de BOOK HAVANA NICE'} loading={i<2?'eager':'lazy'} decoding="async"/>:null}
    <span className="hn-book-folio">{String(i+2).padStart(2,'0')}</span>
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
  {mode==='flip'&&!failure?<div className="hn-book-stage">
   <div className={'hn-book-mount'+(turning?' hn-book-turning':'')} ref={mountRef}/>
  </div>:null}
  {mode==='scroll'?<div className="hn-book-scroll">{leaves}</div>:null}
  <div className="hn-book-source" aria-hidden="true" ref={sourceRef}>{leaves}</div>
  {mode==='flip'&&!failure?<div className="hn-book-controls">
   <button type="button" onClick={()=>flip('prev')} disabled={!canPrev||turning} aria-label="Página anterior">‹</button>
   <div className="hn-book-counter"><strong>{String(page+1).padStart(2,'0')} <span>/</span> {String(count).padStart(2,'0')}</strong>
    <div className="hn-book-progress"><span style={{width:((page+1)/count*100)+'%'}}/></div>
    <small>{orientation==='landscape'?'Libro abierto · dos páginas':'Arrastra la esquina para pasar la página'}</small>
   </div>
   <button type="button" onClick={()=>flip('next')} disabled={!canNext||turning} aria-label="Página siguiente">›</button>
  </div>:null}
 </section>;
}
