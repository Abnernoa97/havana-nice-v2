// Authorization-scoped, short-lived grants live only inside the mounted viewer.
// Switching members must never reuse a previously authorized private URL.
export type ChatGalleryGrant={url:string;at:number};
export type ChatGalleryGrantScope={
 owner:string;
 entries:Map<string,ChatGalleryGrant>;
};
export function keepChatGrantsForToken(scope:ChatGalleryGrantScope,token:string):void{
 if(scope.owner===token)return;
 scope.owner=token;
 scope.entries.clear();
}
