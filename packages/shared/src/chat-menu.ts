// One Chat UI policy for both PWA and Android; independent of DOM, Expo and credentials.
// Platform-specific safe areas remain parameters, not separate implementations.
export const CHAT_EDIT_WINDOW_MS=15*60*1000;
export const CHAT_DELETE_WINDOW_MS=48*60*60*1000;

export type ChatMenuAnchor={x:number;y:number;width:number;height:number};
export type ChatMenuMessage={senderId:string;sentAt:string;pending?:boolean};
export type ChatMenuViewport={
 width:number;height:number;offsetTop:number;topPadding:number;bottomPadding:number;
 maxWidth:number;menuHeight:number;
};

export function getChatMenuState(
 message:ChatMenuMessage|null,
 actorId:string|undefined,
 connection:string,
 anchor:ChatMenuAnchor|null,
 viewport:ChatMenuViewport,
 now=Date.now(),
){
 const owned=!!message&&message.senderId===actorId&&!message.pending;
 const age=message?now-Date.parse(message.sentAt):Infinity;
 const connected=connection==='en vivo';
 const canEdit=owned&&connected&&age<CHAT_EDIT_WINDOW_MS;
 const canDelete=owned&&connected&&age<CHAT_DELETE_WINDOW_MS;
 const width=Math.min(viewport.maxWidth,Math.max(180,viewport.width-24));
 const {offsetTop,height,menuHeight}=viewport;
 const preferredTop=anchor&&anchor.y>offsetTop+menuHeight+16
  ? anchor.y-menuHeight-8
  : (anchor?.y??(offsetTop+(height-menuHeight)/2))+(anchor?.height??0)+8;
 const top=Math.max(offsetTop+viewport.topPadding,
  Math.min(preferredTop,offsetTop+height-menuHeight-viewport.bottomPadding));
 const preferredLeft=anchor
  ?(owned?anchor.x+anchor.width-width:anchor.x)
  :(viewport.width-width)/2;
 const left=Math.max(12,Math.min(preferredLeft,viewport.width-width-12));
 return {owned,canEdit,canDelete,width,top,left};
}
