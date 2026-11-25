// Compact native attachment strip; uploads and pending originals remain untouched.
import React from 'react';
import {View,Text,Pressable,ScrollView,Image,StyleSheet} from 'react-native';
import {CHAT_MEDIA_MAX_PER_SEND} from '@havana/shared';
import {styles} from '../../styles/chat-styles';
import type {NativeQueuedMedia} from './useNativeMediaSelection';

type Props={
 selectedMedia:NativeQueuedMedia[];
 mediaUploading:boolean;
 mediaProgress:number;
 mediaReady:boolean;
 onRemove:(item:NativeQueuedMedia)=>void;
 inTimeline?:boolean;
 onCancel?:()=>void;
};
export default function NativeChatMediaQueuePreview({
 selectedMedia,mediaUploading,mediaProgress,mediaReady,onRemove,inTimeline=false,onCancel
}:Props){
 if(inTimeline)return <View style={[styles.galleryCluster,styles.galleryMine]} accessibilityLabel="Archivos pendientes de envío">
  <View style={styles.galleryGrid}>
   {selectedMedia.map((item,index)=>{
    const wide=index===0&&selectedMedia.length%2===1;
    return <View key={item.id} style={[styles.galleryCell,wide&&styles.galleryWideCell]}>
     <View style={[s.pendingTile,{aspectRatio:wide?2:1}]}>
      {item.kind==='photo'?<Image source={{uri:item.uri}} style={s.pendingPhoto} resizeMode="cover" resizeMethod="resize" fadeDuration={0}/>:<Text style={s.videoPlay}>▶</Text>}
      <View style={s.pendingMark}><Text style={s.pendingMarkText}>↗</Text></View>
     </View>
    </View>;
   })}
  </View>
  <View style={s.pendingStatus}>
   <Text style={s.caption}>{!selectedMedia.length?'Confirmando…':mediaProgress===0?'Preparando…':'Enviando '+mediaProgress+' %'}</Text>
   <Pressable accessibilityRole="button" onPress={onCancel}><Text style={s.pendingCancel}>Cancelar</Text></Pressable>
  </View>
 </View>;
 return <View style={s.root} accessibilityLabel="Archivos para enviar">
  <View style={s.heading}>
   <Text style={s.caption}>{selectedMedia.length}/{CHAT_MEDIA_MAX_PER_SEND} archivos</Text>
   <Text style={s.caption} accessibilityLiveRegion="polite">
    {mediaUploading?'Enviando '+mediaProgress+' %':mediaReady?'Listos para enviar':'Listos para reintentar'}
   </Text>
  </View>
  <ScrollView horizontal style={s.strip} contentContainerStyle={s.items}
   nestedScrollEnabled showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
   {selectedMedia.map(item=><View key={item.id} style={s.tile}
    accessibilityLabel={item.kind==='photo'?'Fotografía seleccionada':'Video seleccionado'}>
    {item.kind==='photo'?
     <Image source={{uri:item.uri}} style={s.thumb} resizeMode="cover" resizeMethod="resize" fadeDuration={0}/>:
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
 pendingTile:{width:'100%',borderRadius:5,overflow:'hidden',backgroundColor:'#264636',alignItems:'center',justifyContent:'center'},
 pendingPhoto:{width:'100%',height:'100%'},
 pendingMark:{position:'absolute',right:5,bottom:5,paddingHorizontal:5,borderRadius:5,backgroundColor:'#153d31dd'},
 pendingMarkText:{color:'#fff',fontSize:11},
 pendingStatus:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingTop:4},
 pendingCancel:{fontSize:11,color:'#87573d',fontWeight:'600'},
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
