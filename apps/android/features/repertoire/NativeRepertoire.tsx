import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {calendarDate,getCalendarEvents,getAssignedEventRepertoire,getRepertoireSongs,
 safeRepertoireLink,HAVANA_V2_DEV_API_BASE_URL,
 type CalendarEvent,type RepertoireEventItem,type RepertoireSong} from '@havana/shared';

// Same authorized D1 API and grouping as MemberRepertoire in the PWA.
// The HOME owns identity; this module owns only its data and error state.
export default function NativeRepertoire({token}:{token:string}){
 const [songs,setSongs]=useState<RepertoireSong[]>([]);
 const [assigned,setAssigned]=useState<{event:CalendarEvent;items:RepertoireEventItem[]}[]>([]);
 const [opened,setOpened]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const requestId=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++requestId.current;
  try{
   const [catalog,events,items]=await Promise.all([
    getRepertoireSongs(token),getCalendarEvents(token,HAVANA_V2_DEV_API_BASE_URL),
    getAssignedEventRepertoire(token)
   ]);
   if(id!==requestId.current)return;
   const byEvent=new Map<string,RepertoireEventItem[]>();
   for(const item of items){const list=byEvent.get(item.eventId)||[];
    list.push(item);byEvent.set(item.eventId,list);}
   setSongs(catalog);
   setAssigned(events.filter(event=>byEvent.has(event.id)).map(event=>({
    event,items:byEvent.get(event.id)!
   })));
   setError('');
  }catch(e){if(id===requestId.current)setError(e instanceof Error?e.message:'No se pudo cargar Repertorio.');}
  finally{if(id===requestId.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setSongs([]);setAssigned([]);setOpened(null);setLoading(true);setError('');
  void refresh();
  const sub=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
  return()=>{++requestId.current;sub.remove();};
 },[refresh]);
 const categories=[...new Set(songs.map(song=>song.category))];
 const link=(value:string)=>{
  const url=safeRepertoireLink(value);
  if(url)void Linking.openURL(url).catch(()=>setError('No se pudo abrir el enlace.'));
 };
 return <View style={styles.root}>
  <View style={styles.toolbar}>
   <Text style={styles.eyebrow}>REPERTORIO DEL EQUIPO</Text>
   <Pressable accessibilityRole="button" onPress={()=>void refresh()}><Text style={styles.action}>Actualizar</Text></Pressable>
  </View>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  {loading?<Text style={styles.empty}>Cargando repertorio…</Text>:<>
   <Text style={styles.section}>Repertorio general</Text>
   {!songs.length?<Text style={styles.empty}>El Administrador aún no ha añadido canciones.</Text>:
    categories.map(category=><View key={category} style={styles.group}>
     <Text style={styles.category}>{category}</Text>
     {songs.filter(song=>song.category===category).map(song=><View key={song.id} style={styles.song}>
      <View style={styles.songText}><Text style={styles.name}>{song.title}</Text>
       {!!song.artist&&<Text style={styles.artist}>{song.artist}</Text>}</View>
      {!!safeRepertoireLink(song.referenceUrl)&&<Pressable accessibilityRole="link"
       onPress={()=>link(song.referenceUrl)}><Text style={styles.action}>REVISAR LINK ↗</Text></Pressable>}
     </View>)}
    </View>)}
   <Text style={styles.section}>Repertorio por evento</Text>
   {!assigned.length?<Text style={styles.empty}>Aún no tienes canciones asignadas por evento.</Text>:
    assigned.map(({event,items})=><View key={event.id} style={styles.group}>
     <Pressable accessibilityRole="button" accessibilityLabel={'Repertorio de '+event.title}
      accessibilityState={{expanded:opened===event.id}}
      style={styles.eventHead} onPress={()=>setOpened(v=>v===event.id?null:event.id)}>
      <View style={styles.songText}><Text style={styles.artist}>{calendarDate(event.date)}</Text>
       <Text style={styles.eventName}>{event.title}</Text>
       <Text style={styles.artist}>{items.filter(item=>item.completed).length} / {items.length} realizadas</Text></View>
      <Text style={styles.expand}>{opened===event.id?'−':'+'}</Text>
     </Pressable>
     {opened===event.id&&items.map((item,i)=><View key={item.id} style={styles.song}>
      <View style={styles.songText}>
       <Text style={styles.name}>{i+1}. {item.title}</Text>
       {!!item.artist&&<Text style={styles.artist}>{item.artist}</Text>}
       <Text style={styles.artist}>{item.completed?'✓ Realizada':item.songId?'Pendiente':'Especial · pendiente'}</Text>
      </View>
      {!!safeRepertoireLink(item.referenceUrl)&&<Pressable accessibilityRole="link"
       onPress={()=>link(item.referenceUrl)}><Text style={styles.action}>REVISAR LINK ↗</Text></Pressable>}
     </View>)}
    </View>)}
  </>}
 </View>;
}
const styles=StyleSheet.create({
 root:{gap:13,paddingBottom:30},toolbar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 eyebrow:{fontSize:10,letterSpacing:1.5,color:'#917252',fontWeight:'700'},action:{fontSize:10,color:'#856243',fontWeight:'700'},
 error:{color:'#ad3434',fontSize:13},empty:{paddingVertical:15,color:'#81756b',fontSize:13},
 section:{fontSize:23,color:'#272923',fontWeight:'700',marginTop:16,marginBottom:4},
 group:{borderWidth:1,borderColor:'#D5CAB8',borderRadius:15,overflow:'hidden',backgroundColor:'#fffaf2'},
 category:{fontSize:16,color:'#272923',fontWeight:'700',padding:15},
 song:{flexDirection:'row',gap:12,alignItems:'center',justifyContent:'space-between',padding:14,borderTopWidth:1,borderTopColor:'#eee4d7'},
 songText:{flex:1,gap:3},name:{fontSize:14,color:'#272923',fontWeight:'700'},
 artist:{color:'#817468',fontSize:12},eventHead:{flexDirection:'row',alignItems:'center',padding:15},
 eventName:{fontSize:18,color:'#272923',fontWeight:'700',marginVertical:5},
 expand:{fontSize:25,color:'#95734c',paddingHorizontal:6}
});
