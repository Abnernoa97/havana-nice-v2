// One linear-time display projection for the existing Chat; no new state engine.
// Reuse this index from PWA and native so a long history doesn't repeatedly
// scan every message/reaction for every bubble.
import type {ChatEmoji,ChatMessage,ChatReaction,ChatReadReceipt} from './index';

export type ChatReactionBadge={emoji:ChatEmoji;count:number};
export type ChatDisplayIndex={
 replySnippets:ReadonlyMap<number,string>;
 reactionBadges:ReadonlyMap<number,readonly ChatReactionBadge[]>;
 lastReadByOther:number;
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
 let lastRead=0;
 for(const receipt of receipts){
  if(receipt.actorId!==actorId&&receipt.seq>lastRead)lastRead=receipt.seq;
 }
 return {replySnippets,reactionBadges,lastReadByOther:lastRead};
}
