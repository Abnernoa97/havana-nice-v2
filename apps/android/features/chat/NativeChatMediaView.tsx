// Media dispatcher only. Cached photos and on-demand native video remain separate.
import React,{useMemo} from 'react';
import {View,useWindowDimensions} from 'react-native';
import type {ChatMessage,ChatSession} from '@havana/shared';
import NativeChatPhoto from './NativeChatPhoto';
import NativeChatVideo from './NativeChatVideo';
type Media=NonNullable<ChatMessage['media']>;

export default function NativeChatMediaView({
 media,session,compact=false,onOpen,
}:{media:Media;session:ChatSession;compact?:boolean;onOpen?:(assetId:string)=>void}){
 const {width:screenWidth,height:screenHeight}=useWindowDimensions();
 const width=useMemo(()=>compact?
  Math.max(100,Math.floor((Math.min(screenWidth*.86,390)-40)/2)):
  Math.max(170,Math.min(350,Math.floor(screenWidth*.85)-28)),[screenWidth,compact]);
 return <View style={{marginVertical:compact?0:3,alignSelf:'flex-start',maxWidth:'100%'}}>
   {media.kind==='photo'?
     <NativeChatPhoto media={media} session={session} width={width}
       screenWidth={screenWidth} screenHeight={screenHeight} compact={compact} onOpen={onOpen}/>:
     <NativeChatVideo media={media} session={session} width={width} compact={compact} onOpen={onOpen}/>}
 </View>;
}
