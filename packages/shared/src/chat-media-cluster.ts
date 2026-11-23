// Unlimited consecutive visual media from the same musician form one Chat album.
// Upload time, gallery selection batches and the former five-file limit do not split it.
// A voice note, text, reply, deletion or sender change is a real boundary.
import type {ChatMessage} from './index';
export function groupChatMediaMessages(messages:readonly ChatMessage[]):ChatMessage[][]{
 const groups:ChatMessage[][]=[];
 const visual=(media:ChatMessage['media'])=>media?.kind==='photo'||media?.kind==='video';
 for(const message of messages){
  const last=groups[groups.length-1];
  const previous=last?.[last.length-1];
  if(previous&&visual(previous.media)&&visual(message.media)&&
   !previous.deletedAt&&!message.deletedAt&&!previous.replyToSeq&&!message.replyToSeq&&
   previous.senderId===message.senderId)last!.push(message);
  else groups.push([message]);
 }
 return groups;
}
