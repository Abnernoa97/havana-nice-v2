import {useRef,useState} from 'react';
import type {ReactNode,TouchEvent,KeyboardEvent,MouseEvent} from 'react';

export type MessageAnchor={x:number;y:number;width:number;height:number};

type Props={
  children:ReactNode;
  className:string;
  onSwipeRight:()=>void;
  onLongPress:(anchor:MessageAnchor)=>void;
};

// Familiar messaging gestures with HAVANA NICE styling.
// Horizontal movement replies. Vertical scrolling remains native.
export default function SwipeMessage({children,className,onSwipeRight,onLongPress}:Props){
  const start=useRef<{x:number;y:number}|null>(null);
  const elementRef=useRef<HTMLElement|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [shift,setShift]=useState(0);
  const clear=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;};
  const openMenu=()=>{
    const rect=elementRef.current?.getBoundingClientRect();
    if(!rect)return;
    onLongPress({x:rect.left,y:rect.top,width:rect.width,height:rect.height});
  };
  const touchStart=(event:TouchEvent<HTMLElement>)=>{
    const t=event.touches[0];if(!t)return;
    clear();start.current={x:t.clientX,y:t.clientY};
    timer.current=setTimeout(()=>{timer.current=null;start.current=null;setShift(0);openMenu();},550);
  };
  const touchMove=(event:TouchEvent<HTMLElement>)=>{
    const current=start.current,t=event.touches[0];if(!current||!t)return;
    const dx=t.clientX-current.x,dy=t.clientY-current.y;
    if(Math.abs(dx)>12||Math.abs(dy)>12)clear();
    setShift(dx>0 && dx>Math.abs(dy)*1.2?Math.min(78,dx):0);
  };
  const touchEnd=(event:TouchEvent<HTMLElement>)=>{
    const current=start.current,t=event.changedTouches[0];
    clear();start.current=null;setShift(0);
    if(current&&t){const dx=t.clientX-current.x,dy=t.clientY-current.y;
      if(dx>60&&dx>Math.abs(dy)*1.2)onSwipeRight();
    }
  };
  const menu=(event:MouseEvent<HTMLElement>)=>{event.preventDefault();clear();openMenu();};
  const keyboard=(event:KeyboardEvent<HTMLElement>)=>{
    if(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10')){
      event.preventDefault();openMenu();
    }
  };
  return <article ref={elementRef} className={className} tabIndex={0}
      style={{touchAction:'pan-y',transform:shift?'translateX('+shift+'px)':undefined,
        transition:shift?'none':'transform 130ms ease'}}
      onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd}
      onTouchCancel={()=>{clear();start.current=null;setShift(0);}}
      onContextMenu={menu} onKeyDown={keyboard}
      aria-label="Mensaje. Desliza a la derecha para responder, mantén pulsado para opciones">
      {children}
    </article>;
}
