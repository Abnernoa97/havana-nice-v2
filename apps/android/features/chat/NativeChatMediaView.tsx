// Media dispatcher only. Cached photos and on-demand native video remain separate.
import React,{useMemo} from 'react';
import {View,useWindowDimensions} from 'react-native';
import type {ChatMessage,ChatSession} from '@havana/shared';
import NativeChatPhoto from './NativeChatPhoto';
import NativeChatVideo from './NativeChatVideo';
import NativeChatVoiceMessage from './NativeChatVoiceMessage';
type Media=NonNullable<ChatMessage['media']>;

export default function NativeChatMediaView({
 media,session,compact=false,onOpen,
}:{media:Media;session:ChatSession;compact?:boolean;onOpen?:(assetId:string)=>void}){
 const {width:screenWidth,height:screenHeight}=useWindowDimensions();
 const width=useMemo(()=>Math.max(170,Math.min(350,Math.floor(screenWidth*.85)-28)),[screenWidth]);
 // Compact tiles take their geometry from the gallery cell, never screen width.
 return <View style={compact?{width:'100%',aspectRatio:1}:{marginVertical:3,alignSelf:'flex-start',maxWidth:'100%'}}>
   {media.kind==='audio'?<NativeChatVoiceMessage media={media} session={session}/>:
    media.kind==='photo'?
     <NativeChatPhoto media={media} session={session} width={width}
       screenWidth={screenWidth} screenHeight={screenHeight} compact={compact} onOpen={onOpen}/>:
     <NativeChatVideo media={media} session={session} width={width} compact={compact} onOpen={onOpen}/>}
 </View>;
}
