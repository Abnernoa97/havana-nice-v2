import React from 'react';
import {Image,StyleSheet,View} from 'react-native';

// Stable native bitmap surface. Timeline, keyboard, reactions and voice do not
// recreate the Image while the story id and temporary R2 grant stay unchanged.
export default React.memo(function NativeStoryPhoto({uri,onError,onReady}:{
 uri:string;onError:()=>void;onReady:()=>void;
}){
 return <View style={s.stage}>
  <Image style={s.image} source={{uri,cache:'force-cache'}} resizeMode="contain"
   fadeDuration={0} progressiveRenderingEnabled onError={onError} onLoad={onReady}/>
 </View>;
});
const s=StyleSheet.create({
 stage:{position:'absolute',top:0,right:0,bottom:0,left:0,backgroundColor:'#0b100d'},
 image:{width:'100%',height:'100%'},
});
