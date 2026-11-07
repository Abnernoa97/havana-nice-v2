import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
// Dependency-free native shapes match the PWA's monochrome composer icon set.
export type NativeComposerIconName='emoji'|'clip'|'camera'|'mic'|'send'|'photo'|'video';
export default function NativeComposerIcon({name,color='#697378'}:{
 name:NativeComposerIconName;color?:string
}){
 if(name==='emoji')return <View style={[x.face,{borderColor:color}]}>
   <View style={x.faceEyes}><View style={[x.eye,{backgroundColor:color}]}/><View style={[x.eye,{backgroundColor:color}]}/></View>
   <View style={[x.smile,{borderColor:color}]}/>
 </View>;
 if(name==='clip')return <View style={[x.clipOutside,{borderColor:color}]}>
   <View style={[x.clipInside,{borderColor:color}]}/>
 </View>;
 if(name==='camera')return <View style={[x.cameraShell,{borderColor:color}]}>
   <View style={[x.cameraBump,{borderColor:color}]}/>
   <View style={[x.cameraLens,{borderColor:color}]}/>
 </View>;
 if(name==='mic')return <View style={x.micWrap}>
   <View style={[x.micBody,{backgroundColor:color}]}/>
   <View style={[x.micCradle,{borderColor:color}]}/>
   <View style={[x.micStand,{backgroundColor:color}]}/>
   <View style={[x.micBase,{backgroundColor:color}]}/>
 </View>;
 if(name==='photo')return <View style={[x.photoFrame,{borderColor:color}]}>
   <View style={[x.photoSun,{backgroundColor:color}]}/>
   <View style={[x.photoMountain,{borderColor:color}]}/>
 </View>;
 if(name==='video')return <View style={[x.videoFrame,{borderColor:color}]}>
   <Text style={[x.videoPlay,{color}]}>▶</Text>
 </View>;
 return <Text style={[x.sendArrow,{color}]}>➤</Text>;
}
const x=StyleSheet.create({
 face:{height:24,width:24,borderWidth:2,borderRadius:12,alignItems:'center',justifyContent:'center'},
 faceEyes:{position:'absolute',top:6,flexDirection:'row',gap:6},
 eye:{height:3,width:3,borderRadius:2},
 smile:{position:'absolute',bottom:4,height:6,width:13,borderBottomWidth:2,
  borderBottomLeftRadius:9,borderBottomRightRadius:9},
 clipOutside:{width:13,height:25,borderWidth:2.2,borderRadius:8,
  transform:[{rotate:'37deg'}],alignItems:'center',justifyContent:'center'},
 clipInside:{height:16,width:5,borderLeftWidth:1.8,borderBottomWidth:1.8,
  borderTopWidth:1.8,borderTopLeftRadius:4,borderBottomLeftRadius:4},
 cameraShell:{width:25,height:19,borderWidth:2.1,borderRadius:4,
  marginTop:4,alignItems:'center',justifyContent:'center'},
 cameraBump:{position:'absolute',top:-6,left:4,width:11,height:5,borderWidth:2,
  borderBottomWidth:0,borderTopLeftRadius:3,borderTopRightRadius:3},
 cameraLens:{width:10,height:10,borderRadius:5,borderWidth:2},
 micWrap:{height:26,width:24,alignItems:'center'},
 micBody:{height:17,width:9,borderRadius:5},
 micCradle:{position:'absolute',top:7,height:15,width:17,borderWidth:2,
  borderTopColor:'transparent',borderBottomLeftRadius:9,borderBottomRightRadius:9},
 micStand:{position:'absolute',bottom:1,height:6,width:2},
 micBase:{position:'absolute',bottom:0,height:2,width:11,borderRadius:2},
 photoFrame:{width:26,height:24,borderWidth:2,borderRadius:4},
 photoSun:{position:'absolute',top:5,left:5,width:5,height:5,borderRadius:3},
 photoMountain:{position:'absolute',bottom:2,left:7,width:12,height:9,
  borderLeftWidth:2,borderTopWidth:2,transform:[{rotate:'45deg'}]},
 videoFrame:{width:26,height:24,borderWidth:2,borderRadius:4,alignItems:'center',justifyContent:'center'},
 videoPlay:{fontSize:13,lineHeight:18,marginLeft:2},
 sendArrow:{fontSize:24,fontWeight:'700',marginLeft:2},
});
