import type {ReactNode} from 'react';
// Consistent monochrome composer icons; no emoji-font or third-party icon library.
export type ComposerIconName='emoji'|'clip'|'camera'|'mic'|'send'|'photo'|'video';
export default function ComposerIcon({name,size=24}:{name:ComposerIconName;size?:number}){
 let shape:ReactNode;
 switch(name){
  case 'emoji':shape=<><circle cx="12" cy="12" r="9"/><path d="M8 14.5c1.7 2.3 6.3 2.3 8 0"/><path d="M8.6 9.4h.1M15.3 9.4h.1" strokeWidth="2.7"/></>;break;
  case 'clip':shape=<path d="m20.5 10.6-8.9 8.9a5.5 5.5 0 0 1-7.8-7.8L13.6 2a3.6 3.6 0 0 1 5.1 5.1l-9.6 9.6a1.7 1.7 0 0 1-2.4-2.4l8.7-8.7"/>;break;
  case 'camera':shape=<><path d="M3 7h4l2-2h6l2 2h4v12H3z"/><circle cx="12" cy="13" r="3.6"/></>;break;
  case 'mic':shape=<><rect x="9" y="2.8" width="6" height="12" rx="3"/><path d="M6 11.2a6 6 0 0 0 12 0M12 17.4v3.7M8.3 21h7.4"/></>;break;
  case 'send':shape=<><path d="m4 12 16-8-4.8 16-3.6-6.4L4 12Z"/><path d="m11.6 13.6 8.4-9.6"/></>;break;
  case 'photo':shape=<><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.3" cy="9.3" r="1.4"/><path d="m4 17 5-5 3.4 3.5 3.3-3.2 4.3 5"/></>;break;
  case 'video':shape=<><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="m10 8.5 6 3.5-6 3.5z"/></>;break;
  default:shape=<path d="m6 6 12 12M18 6 6 18"/>;
 }
 return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
  fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
  strokeLinejoin="round" aria-hidden="true" focusable="false">{shape}</svg>;
}
