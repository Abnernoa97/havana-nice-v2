import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Linking,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {NativePushControl} from './useNativePush';
import {getMemberNotices,markMemberNoticesRead,memberNoticeMessage,
 openFamilyRealtime,FAMILY_WS_HANDSHAKE_TIMEOUT_MS,
 type MemberNotice,type MemberNoticeInbox} from '@havana/shared';

// One existing musician session, one notification-only Familia stream while this
// tab is active. Never create a second Chat owner or persist private inbox data.
export default function NativeNotices({token,calendarRevision=0,push}:{token:string;calendarRevision?:number;push:NativePushControl}){
 const [inbox,setInbox]=useState<MemberNoticeInbox>({items:[],unread:0});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const id=useRef(0);
 const refresh=useCallback(async()=>{
  const ticket=++id.current;
  try{const result=await getMemberNotices(token);
   if(ticket===id.current){setInbox(result);setError('');}
  }catch(e){if(ticket===id.current)setError(
   e instanceof Error?e.message:'No se pudieron cargar las notificaciones.');}
  finally{if(ticket===id.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setLoading(true);setInbox({items:[],unread:0});void refresh();
  let mounted=true,socket:WebSocket|null=null;
  let retry:ReturnType<typeof setTimeout>|null=null;
  let watchdog:ReturnType<typeof setTimeout>|null=null;
  let delay=1000;
  const clear=()=>{
   if(retry){clearTimeout(retry);retry=null;}
   if(watchdog){clearTimeout(watchdog);watchdog=null;}
  };
  const connect=()=>{
   if(!mounted||AppState.currentState!=='active'||socket)return;
   clear();
   try{
    const opened=openFamilyRealtime(token,false,event=>{
     if(mounted&&socket===opened&&
      (event.type==='family.ready'||event.type==='family.invalidate'))void refresh();
    });
    socket=opened;
    watchdog=setTimeout(()=>{
     if(socket!==opened||opened.readyState===WebSocket.OPEN)return;
     socket=null;try{opened.close();}catch{}
     clear();if(mounted){retry=setTimeout(connect,delay);delay=Math.min(12000,delay*2);}
    },FAMILY_WS_HANDSHAKE_TIMEOUT_MS);
    opened.onopen=()=>{if(socket===opened){clear();delay=1000;}};
    opened.onclose=()=>{if(socket!==opened)return;
     socket=null;clear();
     if(mounted&&AppState.currentState==='active'){
      retry=setTimeout(connect,delay);delay=Math.min(12000,delay*2);
     }
    };
    opened.onerror=()=>{if(socket===opened)opened.close();};
   }catch{retry=setTimeout(connect,delay);delay=Math.min(12000,delay*2);}
  };
  connect();
  const sub=AppState.addEventListener('change',state=>{
   if(state==='active'){void refresh();connect();}
   else{clear();const old=socket;socket=null;old?.close();}
  });
  return()=>{mounted=false;++id.current;clear();socket?.close();sub.remove();};
 },[token,refresh]);
 useEffect(()=>{if(calendarRevision>0)void refresh();},[calendarRevision,refresh]);
 const mark=async(item?:MemberNotice)=>{
  try{await markMemberNoticesRead(token,item?.id);await refresh();}
  catch(e){setError(e instanceof Error?e.message:'No se pudo marcar como leído.');}
 };
 return <View style={s.root}>
  <View style={s.head}>
   <View><Text style={s.title}>Tu actividad</Text>
    <Text style={s.subtitle}>{inbox.unread} nuevas</Text></View>
   <Pressable accessibilityRole="button" onPress={()=>void refresh()}
    style={s.refresh}><Text style={s.link}>Actualizar</Text></Pressable>
  </View>
  <View style={s.pushCard} accessibilityLabel="Notificaciones del teléfono">
   <Text style={s.pushTitle}>Avisos con la pantalla bloqueada</Text>
   <Text style={s.pushInfo}>{push.state==='enabled'?
    'Activados en este Android. Recibirás avisos de Chat, Estados, Familia y Calendario.':
    push.state==='blocked'?'Android tiene bloqueadas las notificaciones de HAVANA NICE.':
    push.state==='pending'?'Firebase todavía no está listo para enviar los avisos.':
    push.state==='checking'?'Comprobando el registro de este teléfono…':
    push.state==='unavailable'?'Los avisos externos no están disponibles en este dispositivo.':
    'Activa los avisos para recibirlos incluso cuando la aplicación esté cerrada.'}</Text>
   {push.state==='enabled'?<View style={s.pushActions}>
    <Pressable accessibilityRole="button"
     style={s.pushButton} onPress={()=>void push.test()}>
     <Text style={s.pushButtonText}>Probar aviso</Text>
    </Pressable>
    <Pressable accessibilityRole="button"
     style={s.pushButton} onPress={()=>void push.disable()}>
     <Text style={s.pushButtonText}>Desactivar avisos</Text>
    </Pressable>
   </View>:push.state==='blocked'?<Pressable accessibilityRole="button"
    style={s.pushButton} onPress={()=>void push.openSettings()}>
    <Text style={s.pushButtonText}>Abrir ajustes de Android</Text>
   </Pressable>:['ready','error'].includes(push.state)?<Pressable accessibilityRole="button"
    style={s.pushButton} onPress={()=>void push.enable()}>
    <Text style={s.pushButtonText}>Activar notificaciones</Text>
   </Pressable>:null}
   {!!push.error&&<Text style={s.error}>{push.error}</Text>}
   {!!push.testStatus&&<Text style={s.pushInfo}>{push.testStatus}</Text>}
  </View>
  {inbox.unread>0&&<Pressable accessibilityRole="button"
   style={s.readAll} onPress={()=>void mark()}>
   <Text style={s.readAllLabel}>Marcar todas como leídas</Text>
  </Pressable>}
  {!!error&&<Text style={s.error}>{error}</Text>}
  {loading?<Text style={s.empty}>Cargando actividad…</Text>:
   !inbox.items.length?<Text style={s.empty}>
    Aquí aparecerán las reacciones, comentarios y avisos que recibas.
   </Text>:<ScrollView style={s.list} nestedScrollEnabled>
    {inbox.items.map(item=><View key={item.id} style={[s.card,!item.readAt&&s.unread]}>
     <Text style={s.dot}>{item.readAt?'':'•'}</Text>
     <View style={s.copy}>
      <Text style={s.name}>{memberNoticeMessage(item)}</Text>
      {!!item.preview&&<Text style={s.preview}>{item.preview}</Text>}
      {item.kind==='admin.announcement'&&item.targetId.startsWith('https://')&&
       <Pressable accessibilityRole="link" onPress={()=>{void Linking.openURL(item.targetId).catch(()=>{});}}>
        <Text style={s.link}>Abrir enlace</Text>
       </Pressable>}
      <Text style={s.time}>{new Date(item.createdAt).toLocaleString('es-MX')}</Text>
     </View>
     {!item.readAt&&<Pressable accessibilityRole="button"
      accessibilityLabel={'Marcar leída la notificación de '+item.name}
      onPress={()=>void mark(item)} style={s.mark}>
      <Text style={s.markLabel}>Leída</Text>
     </Pressable>}
    </View>)}
   </ScrollView>}
 </View>;
}
const s=StyleSheet.create({
 root:{flex:1,gap:12,paddingBottom:12},
 pushCard:{backgroundColor:'#f1f5ed',borderRadius:14,borderWidth:1,borderColor:'#d3decf',padding:14,gap:9},
 pushTitle:{fontSize:14,fontWeight:'700',color:'#193b30'},
 pushActions:{flexDirection:'row',flexWrap:'wrap',gap:8},
 pushInfo:{fontSize:12,color:'#53665b',lineHeight:19},
 pushButton:{alignSelf:'flex-start',backgroundColor:'#173d30',paddingVertical:11,paddingHorizontal:15,borderRadius:11},
 pushButtonText:{fontSize:12,color:'#fff',fontWeight:'700'},
 head:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 title:{fontSize:22,fontWeight:'700',color:'#193b30'},
 subtitle:{fontSize:12,marginTop:4,color:'#617268'},
 refresh:{padding:11},link:{color:'#21513c',fontWeight:'700',fontSize:12},
 readAll:{alignSelf:'flex-start',padding:11,backgroundColor:'#edf3e9',borderRadius:12},
 readAllLabel:{fontSize:12,fontWeight:'700',color:'#28543a'},
 list:{flex:1},
 card:{flexDirection:'row',alignItems:'center',gap:8,backgroundColor:'#fff',
  borderColor:'#e1e3d9',borderWidth:1,borderRadius:14,padding:12,marginBottom:9},
 unread:{backgroundColor:'#f2f7ed',borderColor:'#c3d8c4'},
 dot:{width:10,color:'#26573c',fontSize:16},
 copy:{flex:1,gap:5},
 name:{fontSize:13,fontWeight:'700',color:'#193b30'},
 preview:{fontSize:12,lineHeight:18,color:'#53665b'},
 time:{fontSize:10,color:'#869186'},
 mark:{padding:9,backgroundColor:'#dbeadc',borderRadius:9},
 markLabel:{fontSize:11,fontWeight:'700',color:'#1f4c37'},
 error:{fontSize:12,color:'#9c463d'},
 empty:{fontSize:13,color:'#657067',lineHeight:20,padding:20}
});
