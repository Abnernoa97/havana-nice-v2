// Media dispatcher only. Photo cache/fullscreen and video playback have
// independent modules, so viewing a photo never initializes video machinery.
import React,{useMemo} from 'react';
import {View,useWindowDimensions} from 'react-native';
import type {ChatMessage,ChatSession} from '@havana/shared';
import NativeChatPhoto from './NativeChatPhoto';
import NativeChatVideo from './NativeChatVideo';
type Media=NonNullable<ChatMessage['media']>;

export default function NativeChatMediaView({
 media,session,
}:{media:Media;session:ChatSession}){
 const {width:screenWidth,height:screenHeight}=useWindowDimensions();
 const width=useMemo(()=>Math.max(170,Math.min(350,Math.floor(screenWidth*.85)-28)),[screenWidth]);
 return <View style={{marginVertical:3,alignSelf:'flex-start',maxWidth:'100%'}}>
   {media.kind==='photo'?
     <NativeChatPhoto media={media} session={session} width={width}
       screenWidth={screenWidth} screenHeight={screenHeight}/>:
     <NativeChatVideo media={media} session={session} width={width}/>}
 </View>;
}
