import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {PageFlip} from 'page-flip';
import {bookMediaUrl,type BookPage} from '@havana/shared';
import './book.css';

type FlipEvent={data:number|string};
type BookEngine={
 flipNext:(corner:'top'|'bottom')=>void;
 flipPrev:(corner:'top'|'bottom')=>void;
 turnToPage:(page:number)=>void;
 destroy:()=>void;
 startUserTouch:(point:{x:number;y:number})=>void;
 userMove:(point:{x:number;y:number},touch:boolean)=>void;
 userStop:(point:{x:number;y:number})=>void;
 updateFromHtml:(pages:NodeListOf<HTMLElement>|HTMLElement[])=>void;
 loadFromHTML:(pages:NodeListOf<HTMLElement>|HTMLElement[])=>void;
 getCurrentPageIndex:()=>number;
 getBoundsRect:()=>{left:number;top:number;pageWidth:number;height:number};
 getFlipController:()=>{flip:(point:{x:number;y:number})=>void};
 getPageCollection:()=>{getCurrentSpreadIndex:()=>number;getSpreadIndexByPage:(i:number)=>number};
 on:(event:string,listener:(event:FlipEvent)=>void)=>void;
};

/**
 * One persistent StPageFlip engine. The source pages stay outside the renderer
 * (as in Quotes), but only *real editorial changes* update the DOM pages.
 * A notification or expiring media grant must never tear down the animation.
 */
export default function BookReader({pages,edition='book',coverTitle}:{pages:BookPage[];edition?:'book'|'calendar';coverTitle?:string}){
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
 const touchStart=useRef<{id:number;x:number;y:number;at:number;vertical:boolean;corner:boolean;dragging:boolean}|null>(null);
 // BOOK cover, pages and ending all use the same native paper renderer.
 // Landscape editorial photos receive a separate layout without changing Admin fit.
 const markPhotoLayout=useCallback((image:HTMLImageElement)=>{
  if(!image.naturalWidth||!image.naturalHeight)return;
  const leaf=image.closest<HTMLElement>('.hn-book-photo');
  if(!leaf)return;
  const wide=image.naturalWidth/image.naturalHeight>1.12;
  leaf.classList.toggle('hn-book-wide-photo',wide);
 },[]);
 const count=pages.length+1; // The first Admin image is the cover, never repeated.
 const countRef=useRef(count);
 countRef.current=count;
 const present=pages.length>0;
 const structure=useMemo(()=>edition+'|'+(coverTitle||'')+'|'+pages.map(p=>p.id+':'+p.fit).join('|'),[pages,edition,coverTitle]);
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

 // A decoded landscape image gets a full editorial mount instead of being
 // cropped vertically. All formats retain the Admin's contain/cover choice.
 useEffect(()=>{
  const mount=mountRef.current;
  const source=sourceRef.current;
  const onImageLoad=(event:Event)=>{
   if(event.target instanceof HTMLImageElement)markPhotoLayout(event.target);
  };
  mount?.addEventListener('load',onImageLoad,true);
  source?.addEventListener('load',onImageLoad,true);
  for(const img of [...(mount?.querySelectorAll<HTMLImageElement>('.hn-book-photo img')||[]),
   ...(source?.querySelectorAll<HTMLImageElement>('.hn-book-photo img')||[])]){
   if(img.complete)markPhotoLayout(img);
  }
  return()=>{
   mount?.removeEventListener('load',onImageLoad,true);
   source?.removeEventListener('load',onImageLoad,true);
  };
 },[mode,present,structure,markPhotoLayout]);

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
    flippingTime:650,usePortrait:true,autoSize:false,
    // Vertical gestures remain normal document scrolling; only deliberate
    // horizontal drags belong to the StPageFlip engine.
    showCover:false,mobileScrollSupport:true,swipeDistance:25,
    showPageCorners:window.matchMedia('(hover:hover) and (pointer:fine)').matches,
    disableFlipByClick:true
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
    if(instance.current)syncControls(instance.current);
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

 // Decode only the current spread and the next two genuine R2 originals.
 // No duplicate fetch engine, no compression, no 80-image preload and no
 // regeneration of Book pages. This effect is idle between page turns.
 useEffect(()=>{
  if(mode!=='flip')return;
  const mount=mountRef.current;
  if(!mount)return;
  const cover=mount.querySelector<HTMLImageElement>('img[data-book-cover]');
  if(cover&&page<=1){
   cover.loading='eager';
   cover.fetchPriority=page===0?'high':'auto';
   if(typeof cover.decode==='function')void cover.decode().catch(()=>{});
  }
  const images=mount.querySelectorAll<HTMLImageElement>('img[data-book-id]');
  for(let i=Math.max(0,page-2);i<Math.min(images.length,page+2);i++){
   const img=images.item(i);
   if(!img)continue;
   img.loading='eager';
   img.fetchPriority=i===Math.max(0,page-1)?'high':'auto';
   if(typeof img.decode==='function')void img.decode().catch(()=>{});
   if(img.complete)markPhotoLayout(img);
  }
 },[page,mode,structure,markPhotoLayout]);

 const flip=useCallback((direction:'next'|'prev')=>{
  const engine=instance.current;
  if(!engine||busyRef.current)return;
  const spread=engine.getPageCollection().getCurrentSpreadIndex();
  const last=engine.getPageCollection().getSpreadIndexByPage(count-1);
  if(direction==='next'&&spread<last)engine.flipNext('bottom');
  else if(direction==='prev'&&spread>0){
   // page-flip 2.0.7 hardcodes x=10 in flipPrev(), which is outside
   // the book's left corner when its viewport is centered. With
   // disableFlipByClick:true the library silently discards that turn.
   // Use the *same engine* and its real rectangle for the previous curl.
   const rect=engine.getBoundsRect();
   engine.getFlipController().flip({x:rect.left+10,y:rect.top+rect.height-2});
  }
 },[count]);
 // StPageFlip delays normal touch taps by 250 ms, so a quick tap can be
 // silently ignored. Give every intentional tap one deterministic turn.
 // Drags and horizontal swipes remain owned by StPageFlip, without duplication.
 // One touch owner, with directional intent. StPageFlip still owns the
 // paper geometry, shadows and animation. Browser-native vertical scrolling
 // is never prevented; only deliberate horizontal gestures turn pages.
 const relativePoint=(x:number,y:number)=>{
  const rect=mountRef.current?.querySelector('.stf__block')?.getBoundingClientRect();
  return {x:rect?x-rect.left:0,y:rect?y-rect.top:0};
 };
 const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
  if(event.pointerType==='mouse'||!event.isPrimary||busyRef.current)return;
  const rect=event.currentTarget.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const x=(event.clientX-rect.left)/rect.width;
  const y=(event.clientY-rect.top)/rect.height;
  touchStart.current={id:event.pointerId,x:event.clientX,y:event.clientY,
   at:performance.now(),vertical:false,corner:(x<0.14||x>0.86)&&(y<0.23||y>0.77),dragging:false};
 };
 const onPointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const start=touchStart.current;
  if(!start||start.id!==event.pointerId||start.vertical||busyRef.current)return;
  const dx=Math.abs(event.clientX-start.x);
  const dy=Math.abs(event.clientY-start.y);
  if(dy>10&&dy>dx*1.15){start.vertical=true;return;}
  // A deliberate corner drag directly folds a live page. A normal swipe
  // does not fold early; it turns exactly once on release.
  if(!start.corner||dx<12||dx<=dy*1.2)return;
  const engine=instance.current;
  if(!engine)return;
  if(!start.dragging){
   engine.startUserTouch(relativePoint(start.x,start.y));
   start.dragging=true;
  }
  engine.userMove(relativePoint(event.clientX,event.clientY),true);
 };
 const onPointerUp=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const start=touchStart.current;
  touchStart.current=null;
  if(!start||start.id!==event.pointerId||start.vertical||busyRef.current)return;
  if(start.dragging){
   const engine=instance.current;
   if(!engine)return;
   const dx=event.clientX-start.x;
   const dy=event.clientY-start.y;
   const stageWidth=event.currentTarget.getBoundingClientRect().width;
   const enough=Math.abs(dx)>=Math.min(54,Math.max(38,stageWidth*.1));
   const towardNext=start.x>event.currentTarget.getBoundingClientRect().left+stageWidth*.5&&dx<0;
   const towardPrev=start.x<event.currentTarget.getBoundingClientRect().left+stageWidth*.5&&dx>0;
   if(enough&&Math.abs(dx)>Math.abs(dy)*1.2&&(towardNext||towardPrev)){
    // StPageFlip stopMove() completes only when its folded paper crosses
    // the spine. On mobile, that spine can lie OUTSIDE the viewport, so a
    // natural corner swipe springs back. Finish the existing fold across
    // the spine before releasing it: one engine, one natural 3D curl,
    // no delayed click, extra turn or DOM reconstruction.
    const rect=engine.getBoundsRect();
    const over=Math.max(14,Math.min(30,rect.pageWidth*.08));
    const finishX=rect.left+rect.pageWidth+(towardNext?-over:over);
    const finishY=relativePoint(event.clientX,event.clientY).y;
    engine.userMove({x:finishX,y:finishY},true);
   }
   engine.userStop(relativePoint(event.clientX,event.clientY));
   return;
  }
  const dx=event.clientX-start.x;
  const dy=event.clientY-start.y;
  if(Math.abs(dx)>=30&&Math.abs(dx)>Math.abs(dy)*1.2){
   flip(dx<0?'next':'prev');
   return;
  }
  if(Math.abs(dx)>7||Math.abs(dy)>7||performance.now()-start.at>650)return;
  const bounds=event.currentTarget.getBoundingClientRect();
  if(bounds.width===0)return;
  const fraction=(event.clientX-bounds.left)/bounds.width;
  flip(fraction<(orientation==='landscape'?0.5:0.24)?'prev':'next');
 };
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

 // Flipping changes only counters/controls. Reusing the same React page nodes
 // avoids reconciling all 80 hidden images during each animation frame.
 const leaves=useMemo(()=>{
  const cover=bookMediaUrl(pages[0]?.url);
  return <>
  <div className={'hn-book-leaf hn-book-front'+(pages[0]?.fit==='contain'?' hn-book-contain':'')} data-density="soft">
   {cover?<img src={cover} alt="" data-book-cover="true" loading="eager" decoding="async" fetchPriority="high"/>:null}
   <div className="hn-book-cover-shade"/>
   <div className="hn-book-cover-heading"><small>{edition==='calendar'?'THE MEMORY EDITION':'THE PRIVATE EDITION'}</small>
    <strong>{edition==='calendar'?'EVENT MEMORIES':<>HAVANA<br/>NICE</>}</strong>
    {edition==='calendar'&&coverTitle?<span className="hn-book-memory-name">{coverTitle}</span>:null}
   </div>
   <div className="hn-book-cover-footer">{edition==='calendar'?'HAVANA NICE · EVENTS':'BOOK HAVANA NICE'} <span>01 / EDITION</span></div>
   <span className="hn-book-cover-corner" aria-hidden="true"/>
  </div>
  {pages.slice(1).map((item,i)=>{
   const url=bookMediaUrl(item.url);
   return <div key={item.id} data-book-fit={item.fit}
    className={'hn-book-leaf hn-book-photo '+(item.fit==='contain'?'hn-book-contain':'hn-book-cover-fit')} data-density="soft">
    {url?<img src={url} data-book-id={item.id} alt={'Página '+(i+2)+' de BOOK HAVANA NICE'} loading={i<2?'eager':'lazy'} decoding="async" onLoad={event=>markPhotoLayout(event.currentTarget)}/>:null}
    <span className="hn-book-folio">{String(i+2).padStart(2,'0')}</span>
   </div>;
  })}
  <div className="hn-book-leaf hn-book-back" data-density="soft">
   <small>HAVANA NICE</small><strong>THE END.</strong><span>LIVE MUSIC · MADE PERSONAL</span>
   <span className="hn-book-cover-corner" aria-hidden="true"/>
  </div>
 </>;
 },[pages,edition,coverTitle]);
 if(!present)return <div className="hn-book-empty">{edition==='calendar'?'Aún no hay fotografías de este evento.':'Todavía no hay páginas publicadas. Las imágenes aparecerán cuando Administración las añada.'}</div>;
 return <section className={'hn-book-reader'+(edition==='calendar'?' hn-book-memory-edition':'')} aria-label={edition==='calendar'?'Recuerdos del evento · revista interactiva':'BOOK HAVANA NICE · revista interactiva'}>
  <div className="hn-book-switch" role="group" aria-label="Modo de lectura">
   <button type="button" aria-pressed={mode==='flip'} onClick={()=>setMode('flip')}>Revista 3D</button>
   <button type="button" aria-pressed={mode==='scroll'} onClick={()=>setMode('scroll')}>Desplazar</button>
  </div>
  {mode==='flip'&&!failure?<div className="hn-book-stage" data-orientation={orientation}
   // Intercept the library's native touch listeners at capture, not its
   // renderer. React pointer events arbitrate vertical vs horizontal gestures.
   onTouchStartCapture={event=>event.stopPropagation()}
   onTouchMoveCapture={event=>event.stopPropagation()}
   onTouchEndCapture={event=>event.stopPropagation()}
   onPointerDown={onPointerDown} onPointerMove={onPointerMove}
   onPointerUp={onPointerUp}
   onPointerCancel={event=>{
    const start=touchStart.current;
    touchStart.current=null;
    if(start?.dragging)instance.current?.userStop(relativePoint(event.clientX,event.clientY));
   }}>
   <div className={'hn-book-mount'+(turning?' hn-book-turning':'')+(page===0?' hn-book-closed':' hn-book-opened')} ref={mountRef}/>
  </div>:null}
  {mode==='scroll'?<div className="hn-book-scroll">{leaves}</div>:null}
  <div className="hn-book-source" aria-hidden="true" ref={sourceRef}>{leaves}</div>
  {mode==='flip'&&!failure?<div className="hn-book-controls">
   <button type="button" onClick={()=>flip('prev')} disabled={!canPrev||turning} aria-label="Página anterior">‹</button>
   <div className="hn-book-counter"><strong>{String(page+1).padStart(2,'0')} <span>/</span> {String(count).padStart(2,'0')}</strong>
    <div className="hn-book-progress"><span style={{width:((page+1)/count*100)+'%'}}/></div>
    <small>{orientation==='landscape'?'Libro abierto · dos páginas':'Desliza a los lados para pasar · arriba y abajo para desplazarte'}</small>
   </div>
   <button type="button" onClick={()=>flip('next')} disabled={!canNext||turning} aria-label="Página siguiente">›</button>
  </div>:null}
 </section>;
}
