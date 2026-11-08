import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {getCalendarEvents,calendarDate,calendarEventCompleted,safeCalendarMapUrl,HAVANA_V2_DEV_API_BASE_URL,type CalendarEvent} from '@havana/shared';
import NativeBook from '../book/NativeBook';
import {watchNativeCalendar} from '../../services/native-calendar-live';
// One authorized V2 session; no new identity, token persistence, WebView or Chat.
export default function NativeCalendar({token}:{token:string}){
 const [events,setEvents]=useState<CalendarEvent[]>([]);
 const [open,setOpen]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [archive,setArchive]=useState<CalendarEvent|null>(null);
 const [revision,setRevision]=useState(0);
 const [error,setError]=useState('');
 const pending=useRef<AbortController|null>(null);
 const refresh=useCallback(async()=>{
  // A new server signal supersedes any older in-flight result.
  pending.current?.abort();
  const controller=new AbortController();pending.current=controller;
  try{
   const next=await getCalendarEvents(token,HAVANA_V2_DEV_API_BASE_URL,false,controller.signal);
   if(!controller.signal.aborted){setEvents(next);setRevision(n=>n+1);setError('');}
  }catch(e){
   if(!controller.signal.aborted)setError(e instanceof Error?e.message:'No se pudo consultar Calendario.');
  }finally{
   if(pending.current===controller){
    pending.current=null;if(!controller.signal.aborted)setLoading(false);
   }
  }
 },[token]);
 useEffect(()=>{
  // Foreground socket invalidation replaces the obsolete thirty-second timer.
  const stop=watchNativeCalendar(token,()=>{void refresh();});
  return()=>{stop();pending.current?.abort();pending.current=null;};
 },[token,refresh]);
 return <View style={styles.root}>
  <View style={styles.row}><Text style={styles.caption}>EVENTOS · FECHAS DE TRABAJO</Text>
   <Pressable accessibilityRole="button" onPress={()=>void refresh()}>
    <Text style={styles.link}>Actualizar</Text></Pressable></View>
  {!!error&&<Text style={styles.error}>{error}</Text>}
  {loading?<Text style={styles.empty}>Cargando tus fechas…</Text>:!events.length?
   <Text style={styles.empty}>No tienes eventos asignados.</Text>:
   events.map(item=>{const past=calendarEventCompleted(item);return <View key={item.id} style={styles.event}>
    <Pressable accessibilityRole="button" accessibilityLabel={'Detalles de '+item.title}
     accessibilityState={{expanded:open===item.id}}
     onPress={()=>setOpen(value=>value===item.id?null:item.id)} style={styles.head}>
     <View style={styles.headText}><Text style={styles.date}>{calendarDate(item.date)}</Text>
      <Text style={styles.title}>{item.title}</Text>
      {!!item.venue&&<Text style={styles.venue}>{item.venue}</Text>}
      {past?<View style={styles.stamp}><Text style={styles.stampText}>EVENTO REALIZADO</Text></View>:null}
     </View>
     <Text style={styles.expand}>{open===item.id?'−':'+'}</Text>
    </Pressable>
    {!past&&!!item.mapUrl&&(safeCalendarMapUrl(item.mapUrl)?<Pressable accessibilityRole="link" style={styles.map}
     onPress={()=>{const link=safeCalendarMapUrl(item.mapUrl);if(link)void Linking.openURL(link);}}>
     <Text style={styles.mapText}>Llegar al evento · Google Maps ↗</Text></Pressable>:
     <View style={styles.map}><Text style={styles.mapText}>Google Maps: {item.mapUrl}</Text></View>)}
    {open===item.id&&(past?<View style={styles.memoryPaper}>
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
     {item.memoryCount?<Pressable accessibilityRole="button"
       style={styles.memoryButton} onPress={()=>setArchive(item)}>
       <Text style={styles.memoryButtonTitle}>FOTOGRAFÍAS DEL EVENTO · {item.memoryCount}</Text>
       <Text style={styles.memoryButtonSubtitle}>Abrir recuerdo con efecto BOOK ›</Text>
      </Pressable>:<Text style={styles.memoryEmpty}>Administración incorporará aquí las fotografías de este día.</Text>}
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
   </View>})}
  {archive?<NativeBook token={token} calendarEventId={archive.id} calendarTitle={archive.title}
   refreshKey={revision} onClose={()=>setArchive(null)}/>:null}
 </View>;
}
const styles=StyleSheet.create({
 root:{gap:11,paddingBottom:30},row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
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
 memoryPaper:{padding:19,marginTop:0,backgroundColor:'#F4E6C8',
  borderColor:'#CEB389',borderWidth:1,gap:12},
 archiveLabel:{textAlign:'center',fontSize:9,color:'#8A6946',letterSpacing:1.1,fontWeight:'800'},
 memoryHeading:{fontFamily:'serif',fontSize:27,color:'#453521',textAlign:'center',
  paddingBottom:9,borderBottomColor:'#B89A77',borderBottomWidth:1},
 memoryFacts:{gap:9,paddingVertical:8},
 memoryFact:{fontSize:13,lineHeight:22,color:'#4F4030'},
 memoryBold:{fontWeight:'800',color:'#7B593A'},
 memoryButton:{padding:20,borderColor:'#D2B58B',borderWidth:1,borderRadius:8,
  alignItems:'center',gap:10,backgroundColor:'#F9F0DA'},
 memoryButtonTitle:{fontSize:11,letterSpacing:1,color:'#785436',fontWeight:'800'},
 memoryButtonSubtitle:{fontSize:14,color:'#375942',fontWeight:'700'},
 memoryEmpty:{padding:15,textAlign:'center',fontSize:12,color:'#826749'},

});
