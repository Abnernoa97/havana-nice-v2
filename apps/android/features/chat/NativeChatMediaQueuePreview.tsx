// Presentational only; NativeApp owns the authenticated upload and outbox.
import React from 'react';
import {View,Text,Pressable,ScrollView,Image} from 'react-native';
import {CHAT_MEDIA_MAX_PER_SEND} from '@havana/shared';
import type {NativeQueuedMedia} from './useNativeMediaSelection';
import {styles} from '../../styles/chat-styles';

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
 return (
<View accessibilityLabel="Archivos para enviar">
               <Text style={styles.mediaHint}>{selectedMedia.length} de {CHAT_MEDIA_MAX_PER_SEND} archivos · Fotos y Video</Text>
               <ScrollView style={{maxHeight:190}} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                 {selectedMedia.map(item=><View key={item.id} style={styles.mediaPreview}>
                   {item.kind==='photo'
                     ?<Image source={{uri:item.uri}} style={styles.mediaThumb}/>
                     :<View style={[styles.mediaThumb,styles.videoThumb]}><Text style={styles.videoThumbText}>▶</Text></View>}
                   <View style={styles.mediaInfo}>
                     <Text style={styles.mediaName} numberOfLines={1}>{item.name}</Text>
                     <Text style={styles.mediaHint}>{item.kind==='photo'?'Fotografía':'Video'} · {(item.sizeBytes/1048576).toFixed(1)} MB</Text>
                   </View>
                   <Pressable accessibilityRole="button" disabled={mediaUploading}
                     accessibilityLabel={'Quitar '+item.name}
                     onPress={()=>onRemove(item)}>
                     <Text style={styles.mediaClose}>✕</Text>
                   </Pressable>
                 </View>)}
               </ScrollView>
               <Text style={styles.mediaHint}>{mediaUploading?
                 'Subiendo originales a R2 · '+mediaProgress+' %':
                 mediaReady?'Originales listos para enviar':'Almacenamiento no disponible.'}</Text>
               {mediaUploading&&<View accessibilityLabel="Progreso de subida"
                 style={{height:6,borderRadius:3,backgroundColor:'#d8d1c9',overflow:'hidden',marginTop:7}}>
                 <View style={{height:'100%',width:(mediaProgress+'%') as `${number}%`,backgroundColor:'#6a846e'}}/>
               </View>}
             </View>
 );
}
