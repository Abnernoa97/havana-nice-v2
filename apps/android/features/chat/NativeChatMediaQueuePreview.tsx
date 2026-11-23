// Compact native attachment strip; uploads and pending originals remain untouched.
import React from 'react';
import {View,Text,Pressable,ScrollView,Image,StyleSheet} from 'react-native';
import {CHAT_MEDIA_MAX_PER_SEND} from '@havana/shared';
import type {NativeQueuedMedia} from './useNativeMediaSelection';

type Props={
 selectedMedia:NativeQueuedMedia[];
 mediaUploading:boolean;
 mediaProgress:number;
 mediaReady:boolean;
 onRemove:(item:NativeQueuedMedia)=>void;
};
export default function NativeChatMediaQueuePreview({
 selectedMedia,mediaUploading,mediaProgress,mediaReady,onRemove
}:Props){
 return <View style={s.root} accessibilityLabel="Archivos para enviar">
  <View style={s.heading}>
   <Text style={s.caption}>{selectedMedia.length}/{CHAT_MEDIA_MAX_PER_SEND} archivos</Text>
   <Text style={s.caption} accessibilityLiveRegion="polite">
    {mediaUploading?'Enviando '+mediaProgress+' %':mediaReady?'Listos para enviar':'Almacenamiento no disponible'}
   </Text>
  </View>
  <ScrollView horizontal style={s.strip} contentContainerStyle={s.items}
   nestedScrollEnabled showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
   {selectedMedia.map(item=><View key={item.id} style={s.tile}
    accessibilityLabel={item.kind==='photo'?'Fotografía seleccionada':'Video seleccionado'}>
    {item.kind==='photo'?
     <Image source={{uri:item.uri}} style={s.thumb} resizeMode="cover"/>:
     <View style={[s.thumb,s.video]}><Text style={s.videoPlay}>▶</Text></View>}
    <Pressable accessibilityRole="button" disabled={mediaUploading}
     accessibilityLabel={'Quitar '+item.name} onPress={()=>onRemove(item)} style={s.close}>
     <Text style={s.closeText}>×</Text>
    </Pressable>
   </View>)}
  </ScrollView>
  {mediaUploading&&<View style={s.progress} accessibilityLabel={'Progreso de subida '+mediaProgress+' por ciento'}>
   <View style={[s.fill,{width:(mediaProgress+'%') as `${number}%`}]}/>
  </View>}
 </View>;
}
const s=StyleSheet.create({
 root:{backgroundColor:'#f8f6f0',paddingHorizontal:12,paddingVertical:7,gap:6},
 heading:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 caption:{fontSize:10,color:'#736b61'},
 strip:{flexGrow:0,maxHeight:86},
 items:{flexDirection:'row',gap:7,alignItems:'center',paddingRight:8},
 tile:{width:77,height:77,position:'relative'},
 thumb:{width:77,height:77,borderRadius:11,backgroundColor:'#e5dfd7'},
 video:{alignItems:'center',justifyContent:'center',backgroundColor:'#264636'},
 videoPlay:{fontSize:24,color:'#fff'},
 close:{position:'absolute',top:2,right:2,width:23,height:23,borderRadius:13,
  alignItems:'center',justifyContent:'center',backgroundColor:'#16241ce8',borderWidth:1,
  borderColor:'#ffffffaa'},
 closeText:{color:'#fff',fontSize:17,lineHeight:21},
 progress:{height:4,borderRadius:3,overflow:'hidden',backgroundColor:'#d8d1c9'},
 fill:{height:'100%',backgroundColor:'#6a846e'}
});
