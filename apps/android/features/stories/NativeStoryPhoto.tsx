import React from 'react';
import {Image,StyleSheet,View} from 'react-native';

// Stable native bitmap surface. Timeline, keyboard, reactions and voice do not
// recreate the Image while the story id and temporary R2 grant stay unchanged.
export default React.memo(function NativeStoryPhoto({uri,onError}:{uri:string;onError:()=>void}){
 return <View style={s.stage}>
  <Image style={s.image} source={{uri,cache:'force-cache'}} resizeMode="contain"
   fadeDuration={0} progressiveRenderingEnabled onError={onError}/>
 </View>;
});
const s=StyleSheet.create({
 stage:{...StyleSheet.absoluteFillObject,backgroundColor:'#0b100d'},
 image:{width:'100%',height:'100%'},
});
