// Ignore late server validation after logout, background, a newer request,
// or a different member session. No socket, storage, or platform dependencies.
export class ChatResumeGate {
 private generation=0;
 begin():number{return ++this.generation;}
 invalidate():void{this.generation++;}
 isRequestCurrent(request:number):boolean{return request===this.generation;}
 isCurrent(request:number,expectedToken:string,currentToken:string|undefined,foreground:boolean):boolean{
  return foreground&&request===this.generation&&
    !!expectedToken&&expectedToken===currentToken;
 }
}
