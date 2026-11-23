// Single, platform-neutral selection for the currently loaded Chat history.
// Mosaics are presentation only: text, voice and sender changes cannot stop
// full-screen photo/video navigation. Server pagination stays in Chat controllers.
import type {ChatMessage} from './index';

type Media=NonNullable<ChatMessage['media']>;
export type ChatGallerySelection={items:Media[];initial:number};
export type ChatGalleryTarget={
 senderId:ChatMessage['senderId'];
 clientMessageId:ChatMessage['clientMessageId'];
 assetId:string;
};

export function selectChatGalleryMedia(
 messages:readonly ChatMessage[],target:ChatGalleryTarget,
):ChatGallerySelection|null{
 const items:Media[]=[];
 let initial=-1;
 for(const message of messages){
  const media=message.media;
  if(message.deletedAt||(media?.kind!=='photo'&&media?.kind!=='video'))continue;
  if(message.senderId===target.senderId&&
     message.clientMessageId===target.clientMessageId&&
     media.assetId===target.assetId)initial=items.length;
  items.push(media);
 }
 return initial<0?null:{items,initial};
}
