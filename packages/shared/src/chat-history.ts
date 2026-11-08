import type {ChatMessage,ChatReaction} from './index';

// Pure history rules shared by PWA and native; no WebSocket, React state, or session storage.
export function oldestConfirmedChatSeq(messages:ReadonlyArray<Pick<ChatMessage,'seq'>>):number|null{
 let oldest=Infinity;
 for(const message of messages)if(message.seq>0&&message.seq<oldest)oldest=message.seq;
 return Number.isFinite(oldest)?oldest:null;
}

export function mergeOlderChatReactions(
 before:ReadonlyArray<ChatReaction>,incoming:ReadonlyArray<ChatReaction>,removed:ReadonlySet<number>
):ChatReaction[]{
 const kept=before.filter(r=>!removed.has(r.messageSeq));
 const seen=new Set(kept.map(r=>r.messageSeq+'|'+r.actorId+'|'+r.emoji));
 const added:ChatReaction[]=[];
 for(const reaction of incoming){
  if(removed.has(reaction.messageSeq))continue;
  const id=reaction.messageSeq+'|'+reaction.actorId+'|'+reaction.emoji;
  if(seen.has(id))continue;
  seen.add(id);added.push(reaction);
 }
 return [...added,...kept];
}

// An instance is owned by the original Chat App, never a second session/controller.
export class ChatHistoryRequestGate {
 private olderGeneration=0;
 private searchGeneration=0;
 private snapshotGeneration=0;
 private olderPending=false;
 beginOlder():number|null{
  if(this.olderPending)return null;
  this.olderPending=true;
  return ++this.olderGeneration;
 }
 isOlderCurrent(id:number):boolean{return id===this.olderGeneration;}
 finishOlder(id:number):boolean{
  if(!this.isOlderCurrent(id))return false;
  this.olderPending=false;
  return true;
 }
 beginSearch():number{return ++this.searchGeneration;}
 isSearchCurrent(id:number):boolean{return id===this.searchGeneration;}
 cancelSearch():void{this.searchGeneration++;}
 beginSnapshot():number{return ++this.snapshotGeneration;}
 isSnapshotCurrent(id:number):boolean{return id===this.snapshotGeneration;}
 reset():void{
  this.olderGeneration++;this.searchGeneration++;this.snapshotGeneration++;
  this.olderPending=false;
 }
}
