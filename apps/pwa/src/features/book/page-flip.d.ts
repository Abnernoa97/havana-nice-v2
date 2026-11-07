// StPageFlip 2.0.7 · exactly the browser engine used by HAVANA NICE Quotes Studio.
declare module 'page-flip' {
 export interface PageFlipOptions {
  width:number;height:number;size?:'fixed'|'stretch';
  minWidth?:number;maxWidth?:number;minHeight?:number;maxHeight?:number;
  drawShadow?:boolean;maxShadowOpacity?:number;flippingTime?:number;
  usePortrait?:boolean;autoSize?:boolean;showCover?:boolean;
  mobileScrollSupport?:boolean;swipeDistance?:number;showPageCorners?:boolean;
  disableFlipByClick?:boolean;
 }
 export class PageFlip {
  constructor(root:HTMLElement,options:PageFlipOptions);
  loadFromHTML(pages:NodeListOf<HTMLElement>|HTMLElement[]):void;
  flipNext(corner?:'top'|'bottom'):void;
  flipPrev(corner?:'top'|'bottom'):void;
  getCurrentPageIndex():number;
  on(event:string,listener:(event:{data:number|string})=>void):void;
  destroy():void;
 }
}
