import React,{useCallback,useEffect,useRef,useState} from 'react';
import {AppState,Pressable,StyleSheet,Text,View} from 'react-native';
import {FAMILY_WS_HANDSHAKE_TIMEOUT_MS,getMusicianDirectory,openFamilyRealtime,
 type MusicianDirectoryEntry} from '@havana/shared';
export default function NativeMusicians({token}:{token:string}){
 const [members,setMembers]=useState<MusicianDirectoryEntry[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const generation=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++generation.current;
  try{const result=await getMusicianDirectory(token);
   if(id===generation.current){setMembers(result);setError('');}
  }catch(e){if(id===generation.current)setError(e instanceof Error?e.message:'No se pudo consultar Músicos.');}
  finally{if(id===generation.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  let active=true,socket:WebSocket|null=null;
  let retry:ReturnType<typeof setTimeout>|null=null,watchdog:ReturnType<typeof setTimeout>|null=null;
  let delay=1000;
  const clear=()=>{
   if(retry!==null){clearTimeout(retry);retry=null;}
   if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
  };
  const connect=()=>{
   if(!active||AppState.currentState==='background'||AppState.currentState==='inactive')return;
   if(socket&&(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING))return;
   clear();
   try{
    const opened=openFamilyRealtime(token,false,event=>{
     if(active&&socket===opened&&(event.type==='family.ready'||event.type==='family.invalidate'))void refresh();
    });
    socket=opened;
    watchdog=setTimeout(()=>{
     if(!active||socket!==opened||opened.readyState===WebSocket.OPEN)return;
     socket=null;try{opened.close();}catch{}
     clear();
     if(AppState.currentState==='active'){retry=setTimeout(connect,delay);delay=Math.min(20000,delay*2);}
    },FAMILY_WS_HANDSHAKE_TIMEOUT_MS);
    opened.onopen=()=>{if(active&&socket===opened){
     if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}delay=1000;
    }};
    opened.onclose=event=>{
     if(!active||socket!==opened)return;
     socket=null;
     if(watchdog!==null){clearTimeout(watchdog);watchdog=null;}
     if(event.code===4003)return;
     if(AppState.currentState==='active'){
      clear();retry=setTimeout(connect,delay);delay=Math.min(20000,delay*2);
     }
    };
    opened.onerror=()=>{if(active&&socket===opened)opened.close();};
   }catch{clear();retry=setTimeout(connect,delay);delay=Math.min(20000,delay*2);}
  };
  setMembers([]);setLoading(true);setError('');void refresh();connect();
  const sub=AppState.addEventListener('change',state=>{
   if(state==='active'){void refresh();connect();}
   else{clear();const previous=socket;socket=null;previous?.close();}
  });
  return()=>{active=false;generation.current++;clear();sub.remove();socket?.close();};
 },[token,refresh]);
 return <View style={styles.root}>
  <View style={styles.toolbar}><Text style={styles.heading}>INTEGRANTES AUTORIZADOS</Text>
   <Pressable accessibilityRole="button" onPress={()=>void refresh()}>
    <Text style={styles.action}>Actualizar</Text></Pressable></View>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  {loading?<Text style={styles.empty}>Cargando integrantes…</Text>:
   members.length?members.map(person=><View key={person.actorId} style={styles.person}>
    <Text style={styles.initial}>{person.name.charAt(0).toUpperCase()}</Text>
    <Text style={styles.name}>{person.name}</Text>
   </View>):<Text style={styles.empty}>No hay integrantes autorizados para mostrar.</Text>}
 </View>;
}
const styles=StyleSheet.create({
 root:{gap:13,paddingBottom:26},
 toolbar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 heading:{fontSize:11,fontWeight:'700',letterSpacing:1,color:'#675b4c'},
 action:{fontSize:12,fontWeight:'700',color:'#856243'},
 person:{flexDirection:'row',alignItems:'center',gap:12,padding:13,backgroundColor:'#fffaf2',borderRadius:12},
 initial:{fontSize:22,fontWeight:'700',color:'#756044'},
 name:{fontSize:17,fontWeight:'600',color:'#272923'},
 error:{color:'#ad3434',fontSize:13},empty:{fontSize:13,color:'#81756b'}
});
