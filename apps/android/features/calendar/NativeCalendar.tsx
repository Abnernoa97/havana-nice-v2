import React,{useCallback,useEffect,useRef,useState} from 'react';
import {LayoutAnimation,Linking,Platform,Pressable,StyleSheet,Text,UIManager,View} from 'react-native';
import {getCalendarEvents,getEventRepertoire,calendarDate,calendarEventCompleted,safeCalendarMapUrl,safeRepertoireLink,HAVANA_V2_DEV_API_BASE_URL,type CalendarEvent,type RepertoireEventItem} from '@havana/shared';
import {NativeButtonLight} from '../shared/NativeEmeraldMotion';
import NativeBook from '../book/NativeBook';

// One authorized V2 session; no new identity, token persistence, WebView or Chat.
export default function NativeCalendar({token,calendarRevision=0}:{token:string;calendarRevision?:number}){
 const [events,setEvents]=useState<CalendarEvent[]>([]);
 const [open,setOpen]=useState<string|null>(null);
 const [view,setView]=useState<'upcoming'|'completed'>('upcoming');
 useEffect(()=>{if(Platform.OS==='android')UIManager.setLayoutAnimationEnabledExperimental?.(true);},[]);
 const [loading,setLoading]=useState(true);
 const [revision,setRevision]=useState(0);
 const [error,setError]=useState('');
 const pending=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  // A new server signal supersedes any older in-flight result.
  pending.current?.abort();
  const controller=new AbortController();pending.current=controller;
  try{
   const next=await getCalendarEvents(token,HAVANA_V2_DEV_API_BASE_URL,false,controller.signal);
   if(!controller.signal.aborted){
    setEvents(next);
    // Collapse events that the musician can no longer access.
    setOpen(previous=>previous&&next.some(item=>item.id===previous)?previous:null);
    setRevision(n=>n+1);setError('');
   }
  }catch(e){
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'No se pudo consultar Calendario.');
  }finally{
   if(pending.current===controller){
    pending.current=null;if(!controller.signal.aborted)setLoading(false);
   }
  }
 },[token]);
 // The authenticated native shell owns the sole CalendarRoom connection.
 useEffect(()=>{
  void refresh();
  return()=>{pending.current?.abort();pending.current=null;};
 },[refresh,calendarRevision]);
 const [clock,setClock]=useState(Date.now());
 useEffect(()=>{
  let disposed=false;let timeout:ReturnType<typeof setTimeout>;
  const tick=()=>{if(disposed)return;setClock(Date.now());timeout=setTimeout(tick,60000);};
  timeout=setTimeout(tick,60000);
  return()=>{disposed=true;clearTimeout(timeout);};
 },[]);
 const now=new Date(clock);
 const upcoming=events.filter(item=>!calendarEventCompleted(item,now));
 const completed=events.filter(item=>calendarEventCompleted(item,now));
 const visible=view==='upcoming'?upcoming:completed;
 const setViewClosed=(next:'upcoming'|'completed')=>{
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  setOpen(null);setView(next);
 };
 return <View style={styles.root}>
  <View style={styles.viewButtons}>
   <Pressable accessibilityRole="button" accessibilityState={{selected:view==='upcoming'}}
    onPress={()=>setViewClosed('upcoming')}
    style={[styles.viewButton,view==='upcoming'&&styles.viewActive]}>
    <NativeButtonLight selected={view==='upcoming'} pale/>
    <Text style={[styles.viewButtonText,view==='upcoming'&&styles.viewActiveText]}
     numberOfLines={2}>Eventos por realizar  {upcoming.length}</Text>
   </Pressable>
   <Pressable accessibilityRole="button" accessibilityState={{selected:view==='completed'}}
    onPress={()=>setViewClosed('completed')}
    style={[styles.viewButton,view==='completed'&&styles.viewActive]}>
    <NativeButtonLight selected={view==='completed'} pale/>
    <Text style={[styles.viewButtonText,view==='completed'&&styles.viewActiveText]}
     numberOfLines={2}>Eventos realizados  {completed.length}</Text>
   </Pressable>
  </View>
  {!!error&&<Text style={styles.error}>{error}</Text>}
  {loading?<Text style={styles.empty}>Cargando tus fechas…</Text>:!events.length?
   <Text style={styles.empty}>No tienes eventos asignados.</Text>:!visible.length?
   <Text style={styles.empty}>{view==='upcoming'?'No tienes eventos por realizar.':'Todavía no hay eventos realizados.'}</Text>:
   visible.map(item=>{const past=calendarEventCompleted(item,now);return <View key={item.id} style={styles.event}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Detalles de '+item.title}
     accessibilityState={{expanded:open===item.id}}
     onPress={()=>{LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setOpen(value=>value===item.id?null:item.id);}} style={styles.head}>
     <View style={styles.headText}><Text style={styles.date}>{calendarDate(item.date)}</Text>
      <Text style={styles.title}>{item.title}</Text>
      {!!item.venue&&<Text style={styles.venue}>{item.venue}</Text>}
      {past?<View style={styles.stamp}><Text style={styles.stampText}>EVENTO REALIZADO</Text></View>:null}
     </View>
     <Text style={styles.expand}>{open===item.id?'−':'+'}</Text>
    </Pressable>
    {open===item.id&&!past&&!!item.mapUrl&&(safeCalendarMapUrl(item.mapUrl)?<Pressable accessibilityRole="link" style={styles.map}
     onPress={()=>{const link=safeCalendarMapUrl(item.mapUrl);if(link)void Linking.openURL(link);}}>
     <Text style={styles.mapText}>Llegar al evento · Google Maps ↗</Text></Pressable>:
     <View style={styles.map}><Text style={styles.mapText}>Google Maps: {item.mapUrl}</Text></View>)}
    {open===item.id&&(past?<View style={styles.memoryPaper}>
     <View pointerEvents="none" style={styles.scrollRollTop}/>
     <Text style={styles.archiveLabel}>HAVANA NICE · ARCHIVO DE EVENTOS</Text>
     <Text style={styles.memoryHeading}>Ficha del evento</Text>
     <View style={styles.memoryFacts}>
      <Text style={styles.memoryFact}><Text style={styles.memoryBold}>Fecha  </Text>{calendarDate(item.date)}</Text>
      <Text style={styles.memoryFact}><Text style={styles.memoryBold}>Evento  </Text>{item.title}</Text>
      {!!(item.venue||item.city)&&<Text style={styles.memoryFact}>
       <Text style={styles.memoryBold}>Lugar  </Text>{[item.venue,item.city].filter(Boolean).join(' · ')}
      </Text>}
      {!!item.showTime&&<Text style={styles.memoryFact}><Text style={styles.memoryBold}>Presentación  </Text>{item.showTime}</Text>}
     </View>
     {item.memoryCount?<View style={styles.memoryGallery}>
       <Text style={styles.memoryGalleryTitle}>RECUERDOS DE ESTE DÍA · {item.memoryCount}</Text>
       <NativeBook embedded token={token} calendarEventId={item.id} calendarTitle={item.title}
        refreshKey={revision}/>
      </View>:<Text style={styles.memoryEmpty}>Administración incorporará aquí las fotografías de este día.</Text>}
     <View pointerEvents="none" style={styles.scrollRollBottom}/>
    </View>:<View style={styles.details}>
     <View style={styles.hours}>
      {([['Llamada',item.callTime],['Sonido',item.soundcheckTime],['Llegada',item.arrivalTime],
       ['Show',item.showTime],['Fin',item.endTime]] as [string,string][]).filter(([,v])=>!!v)
       .map(([label,value])=><View key={label} style={styles.hour}>
        <Text style={styles.hourLabel}>{label}</Text>
        <Text style={styles.hourValue}>{value}</Text></View>)}
     </View>
     {!!item.wardrobe&&<Text style={styles.info}><Text style={styles.bold}>Vestuario: </Text>{item.wardrobe}</Text>}
     {!!item.details&&<Text style={styles.info}>{item.details}</Text>}
     {!!item.contactName&&<Text style={styles.info}><Text style={styles.bold}>Contacto: </Text>{item.contactName}{item.contactPhone?' · '+item.contactPhone:''}</Text>}
     {!!item.notes&&<Text style={styles.info}><Text style={styles.bold}>Notas: </Text>{item.notes}</Text>}
     {(!!item.statusText||item.status!=='confirmed')&&<Text style={styles.info}>Estado: {item.statusText|| (item.status==='tentative'?'Tentativo':'Cancelado')}</Text>}
    </View>)}
    {open===item.id&&<NativeEventRepertoire token={token} eventId={item.id} revision={revision}/>}
   </View>})}
 </View>;
}
function NativeEventRepertoire({token,eventId,revision}:{token:string;eventId:string;revision:number}){
 const [items,setItems]=useState<RepertoireEventItem[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;setItems([]);setLoading(true);setError('');
  void getEventRepertoire(token,eventId).then(rows=>{if(alive)setItems(rows);})
   .catch(e=>{if(alive)setError(e instanceof Error?e.message:'No se pudo cargar el repertorio.');})
   .finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[token,eventId,revision]);
 const link=(value:string)=>{const url=safeRepertoireLink(value);
  if(url)void Linking.openURL(url).catch(()=>setError('No se pudo abrir el enlace.'));};
 return <View style={styles.repPanel}>
  <Text style={styles.repTitle}>Repertorio del evento</Text>
  {loading?<Text style={styles.repNote}>Cargando canciones…</Text>:
   error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:
   !items.length?<Text style={styles.repNote}>Aún no hay canciones asignadas a esta fecha.</Text>:<>
    <Text style={styles.repNote}>{items.filter(item=>item.completed).length} / {items.length} realizadas</Text>
    {items.map((item,i)=><View key={item.id} style={styles.repRow}>
     <View style={styles.repSong}><Text style={styles.repSongTitle}>{i+1}. {item.title}</Text>
      {!!item.artist&&<Text style={styles.repNote}>{item.artist}</Text>}
      <Text style={styles.repNote}>{item.completed?'✓ Realizada':item.songId?'Pendiente':'Especial · pendiente'}</Text></View>
     {!!safeRepertoireLink(item.referenceUrl)&&<Pressable accessibilityRole="link" onPress={()=>link(item.referenceUrl)}>
      <Text style={styles.repLink}>REVISAR LINK ↗</Text></Pressable>}
    </View>)}
   </>}
 </View>;
}
const styles=StyleSheet.create({
 root:{gap:11,paddingBottom:30},
 viewButtons:{flexDirection:'row',gap:8,marginTop:2,marginBottom:12},
 viewButton:{flex:1,minWidth:0,minHeight:58,paddingVertical:11,paddingHorizontal:5,
  alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#b6cdb9',
  borderRadius:15,backgroundColor:'#dfebe0',overflow:'hidden'},
 viewActive:{backgroundColor:'#144b36',borderColor:'#154c38'},
 viewButtonText:{fontSize:12,fontWeight:'800',color:'#214c38',textAlign:'center'},
 viewActiveText:{color:'#fffdf5'},
 row:{flexDirection:'row',justifyContent:'flex-end',alignItems:'center'},
 caption:{color:'#917252',fontWeight:'700',fontSize:10,letterSpacing:1.5},link:{color:'#856243',fontWeight:'700',fontSize:12},
 error:{color:'#ac3434',fontSize:13},empty:{marginTop:20,color:'#81756b',fontSize:13,textAlign:'center'},
 event:{backgroundColor:'#FFFAF2',borderColor:'#D5CAB8',borderWidth:1,borderRadius:15,overflow:'hidden'},
 head:{padding:17,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 headText:{flex:1,paddingRight:10},date:{fontSize:11,color:'#98764F',fontWeight:'700'},
 title:{fontSize:23,color:'#272923',fontWeight:'700',marginTop:7},venue:{fontSize:12,color:'#776D60',marginTop:6},
 expand:{color:'#95734C',fontSize:27},map:{borderTopWidth:1,borderTopColor:'#E5D7C5',padding:12},
 mapText:{color:'#886943',fontSize:12,fontWeight:'700',textAlign:'center'},
 details:{padding:16,borderTopWidth:1,borderTopColor:'#E7DCCC',gap:11},
 hours:{flexDirection:'row',flexWrap:'wrap',gap:7},hour:{minWidth:'30%',flexGrow:1,borderWidth:1,borderColor:'#E3D8C9',padding:9},
 hourLabel:{fontSize:9,color:'#817468'},hourValue:{fontSize:13,color:'#282923',marginTop:5,fontWeight:'600'},
 info:{fontSize:13,color:'#545046',lineHeight:21},bold:{fontWeight:'700'},
 stamp:{borderWidth:2,borderColor:'#96533F',alignSelf:'flex-start',paddingHorizontal:9,
  paddingVertical:5,marginTop:10,borderRadius:3,transform:[{rotate:'-8deg'}]},
 stampText:{fontSize:11,color:'#96533F',fontWeight:'800',letterSpacing:1.1},
 memoryPaper:{paddingHorizontal:15,paddingTop:21,paddingBottom:24,marginTop:0,
  backgroundColor:'#f9edda',borderColor:'#c9ac7f',borderWidth:1,gap:7,
  borderBottomLeftRadius:19,borderBottomRightRadius:19,overflow:'hidden'},
 scrollRollTop:{position:'absolute',height:11,top:0,left:8,right:8,
  backgroundColor:'#d8be92',borderBottomWidth:1,borderBottomColor:'#b69563',
  borderBottomLeftRadius:25,borderBottomRightRadius:25},
 scrollRollBottom:{position:'absolute',height:11,bottom:0,left:8,right:8,
  backgroundColor:'#d8be92',borderTopWidth:1,borderTopColor:'#b69563',
  borderTopLeftRadius:25,borderTopRightRadius:25},
 archiveLabel:{textAlign:'center',fontSize:9,color:'#8A6946',letterSpacing:1.1,fontWeight:'800'},
 memoryHeading:{fontFamily:'serif',fontSize:27,color:'#453521',textAlign:'center',
  paddingBottom:9,borderBottomColor:'#B89A77',borderBottomWidth:1},
 memoryFacts:{gap:6,paddingVertical:4},
 memoryFact:{fontSize:13,lineHeight:22,color:'#4F4030'},
 memoryBold:{fontWeight:'800',color:'#7B593A'},
 memoryGallery:{marginTop:0,gap:3},
 memoryGalleryTitle:{textAlign:'center',fontSize:11,letterSpacing:1,color:'#785436',fontWeight:'800'},
 memoryEmpty:{padding:15,textAlign:'center',fontSize:12,color:'#826749'},
 repPanel:{padding:17,backgroundColor:'#f1e5cb',borderTopWidth:1,borderTopColor:'#d5bb97',gap:5},
 repTitle:{fontFamily:'serif',fontSize:19,fontWeight:'700',color:'#234235'},
 repNote:{fontSize:11,color:'#73654f',lineHeight:17},
 repRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:9,
  paddingVertical:12,borderBottomWidth:1,borderBottomColor:'rgba(125,94,55,0.22)'},
 repSong:{flex:1,gap:3},repSongTitle:{fontSize:13,fontWeight:'700',color:'#274033'},
 repLink:{fontSize:10,fontWeight:'700',color:'#725532'},

});
