// One linear-time display projection for the existing Chat; no new state engine.
// Reuse this index from PWA and native so a long history doesn't repeatedly
// scan every message/reaction for every bubble.
import type {ChatEmoji,ChatMessage,ChatReaction,ChatReadReceipt} from './index';

export type ChatReactionBadge={emoji:ChatEmoji;count:number};
export type ChatDisplayIndex={
 replySnippets:ReadonlyMap<number,string>;
 reactionBadges:ReadonlyMap<number,readonly ChatReactionBadge[]>;
 lastReadByOther:number;
 deliveryFor:(message:ChatMessage)=>{label:string;readers:readonly ChatReadReceipt[]};
};
const REACTION_ORDER:readonly ChatEmoji[]=['❤️','😂','👍'];

export function buildChatDisplayIndex(
 messages:readonly ChatMessage[],
 reactions:readonly ChatReaction[],
 receipts:readonly ChatReadReceipt[],
 actorId:string,
):ChatDisplayIndex{
 const replySnippets=new Map<number,string>();
 for(const message of messages){
  // Server sequence numbers are unique. Preserve the first match on unusual
  // duplicate optimistic rows, like the previous Array.find lookup.
  if(!replySnippets.has(message.seq))replySnippets.set(message.seq,message.text.slice(0,70));
 }
 const counts=new Map<number,Map<ChatEmoji,number>>();
 for(const reaction of reactions){
  let row=counts.get(reaction.messageSeq);
  if(!row){row=new Map();counts.set(reaction.messageSeq,row);}
  row.set(reaction.emoji,(row.get(reaction.emoji)||0)+1);
 }
 const reactionBadges=new Map<number,readonly ChatReactionBadge[]>();
 for(const [seq,row] of counts){
  const ordered=REACTION_ORDER.filter(emoji=>(row.get(emoji)||0)>0)
   .map(emoji=>({emoji,count:row.get(emoji)||0}));
  if(ordered.length)reactionBadges.set(seq,ordered);
 }
 // One confirmed, monotonic watermark per other member. No presence inference.
 const byActor=new Map<string,ChatReadReceipt>();
 for(const receipt of receipts){
  if(!receipt.actorId||receipt.actorId===actorId||!Number.isSafeInteger(receipt.seq)||receipt.seq<1)continue;
  const prior=byActor.get(receipt.actorId);
  if(!prior||receipt.seq>=prior.seq)byActor.set(receipt.actorId,receipt);
 }
 const readers=[...byActor.values()].sort((a,b)=>b.seq-a.seq||a.displayName.localeCompare(b.displayName));
 const lastRead=readers[0]?.seq??0;
 const deliveryFor=(message:ChatMessage)=>{
  if(message.pending||message.seq<=0){
   return {label:message.deliveryStatus==='error'?'No enviado':message.deliveryStatus==='sending'?'Enviando…':'En cola',readers:[]};
  }
  if(message.deletedAt||message.senderId!==actorId)return {label:'',readers:[]};
  const confirmed=readers.filter(receipt=>receipt.seq>=message.seq);
  return {label:confirmed.length?'Leído por '+confirmed.length:'Enviado',readers:confirmed};
 };
 return {replySnippets,reactionBadges,lastReadByOther:lastRead,deliveryFor};
}
