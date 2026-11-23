import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Linking,Pressable,StyleSheet,Text,View} from 'react-native';
import {watchNativeRepertoire} from '../../services/native-calendar-live';
import {getRepertoireSongs,repertoireSection,REPERTOIRE_SECTIONS,safeRepertoireLink,
 type RepertoireSection,type RepertoireSong} from '@havana/shared';

export default function NativeRepertoire({token}:{token:string}){
 const [songs,setSongs]=useState<RepertoireSong[]>([]);
 const [open,setOpen]=useState<RepertoireSection|null>('ENGLISH');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const requestId=useRef(0);
 const refresh=useCallback(async()=>{
  const id=++requestId.current;
  try{const next=await getRepertoireSongs(token);
   if(id!==requestId.current)return;setSongs(next);setError('');
  }catch(e){if(id===requestId.current)setError(e instanceof Error?e.message:'No se pudo cargar Repertorio.');}
  finally{if(id===requestId.current)setLoading(false);}
 },[token]);
 useEffect(()=>{
  setSongs([]);setOpen('ENGLISH');setLoading(true);setError('');
  const stop=watchNativeRepertoire(token,()=>void refresh());
  return()=>{++requestId.current;stop();};
 },[token,refresh]);
 const visible=open?songs.filter(song=>repertoireSection(song.category)===open):[];
 const link=(value:string)=>{
  const url=safeRepertoireLink(value);
  if(url)void Linking.openURL(url).catch(()=>setError('No se pudo abrir el enlace.'));
 };
 return <View style={styles.root}>
  <View style={styles.toolbar}><Text style={styles.section}>Repertorio general</Text>
   <Pressable accessibilityRole="button" onPress={()=>void refresh()}><Text style={styles.action}>Actualizar</Text></Pressable>
  </View>
  {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  <View style={styles.paper}>
   <View pointerEvents="none" style={styles.topRoll}/><View pointerEvents="none" style={styles.bottomRoll}/>
   <View pointerEvents="none" style={styles.coffeeHalo}/><View pointerEvents="none" style={styles.coffeeMark}/>
   <View pointerEvents="none" style={styles.paperFold}/>
   <View style={styles.paperBody}>
    <View style={styles.tabs}>{REPERTOIRE_SECTIONS.map(section=><Pressable key={section}
     accessibilityRole="button" accessibilityLabel={'Mostrar '+section}
     accessibilityState={{expanded:open===section}}
     onPress={()=>setOpen(v=>v===section?null:section)}
     style={[styles.tab,open===section&&styles.selectedTab]}>
     <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.74}
      style={[styles.tabText,open===section&&styles.selectedTabText]}>{section}</Text>
     <Text style={[styles.tabPlus,open===section&&styles.selectedTabText]}>{open===section?'−':'+'}</Text>
    </Pressable>)}</View>
    {open&&<View style={styles.songList}>
     {loading?<Text style={styles.empty}>Cargando canciones…</Text>:
      !visible.length?<Text style={styles.empty}>No hay canciones en {open.toLowerCase()}.</Text>:
      visible.map(song=><View key={song.id} style={styles.song}>
       <View style={styles.songText}><Text style={styles.name}>{song.title}</Text>
        {!!song.artist&&<Text style={styles.artist}>{song.artist}</Text>}</View>
       {!!safeRepertoireLink(song.referenceUrl)&&<Pressable accessibilityRole="link"
        onPress={()=>link(song.referenceUrl)}><Text style={styles.action}>REVISAR LINK ↗</Text></Pressable>}
      </View>)}
    </View>}
   </View>
  </View>
  <Text style={styles.hint}>El repertorio de cada evento está en Calendario, dentro de su fecha.</Text>
 </View>;
}
const styles=StyleSheet.create({
 root:{gap:13,paddingBottom:30},toolbar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8},
 section:{fontSize:23,color:'#183c30',fontWeight:'700'},action:{fontSize:10,color:'#755735',fontWeight:'700'},
 error:{color:'#ad3434',fontSize:13},empty:{paddingVertical:18,color:'#746247',fontSize:12},
 paper:{position:'relative',marginTop:13,marginHorizontal:2,backgroundColor:'#e9d4ad',
  borderWidth:1,borderColor:'#ad8e62',borderTopLeftRadius:24,borderTopRightRadius:14,
  borderBottomLeftRadius:17,borderBottomRightRadius:24,overflow:'hidden',elevation:4,
  shadowColor:'#6a5131',shadowOpacity:0.2,shadowRadius:9,shadowOffset:{width:0,height:5}},
 paperBody:{paddingTop:22,paddingBottom:20,paddingHorizontal:10,zIndex:1},
 topRoll:{position:'absolute',left:11,right:11,top:0,height:11,borderBottomWidth:1,
  borderBottomColor:'#bc9f74',backgroundColor:'#d2b68c',borderBottomLeftRadius:25,borderBottomRightRadius:25},
 bottomRoll:{position:'absolute',left:11,right:11,bottom:0,height:12,borderTopWidth:1,
  borderTopColor:'#a98b61',backgroundColor:'#d2b187',borderTopLeftRadius:28,borderTopRightRadius:28},
 coffeeHalo:{position:'absolute',width:165,height:115,right:-49,top:63,borderRadius:90,
  borderWidth:23,borderColor:'rgba(140,98,48,0.09)',transform:[{rotate:'-22deg'}]},
 coffeeMark:{position:'absolute',width:105,height:95,left:-31,bottom:38,borderRadius:60,
  borderWidth:13,borderColor:'rgba(105,73,35,0.10)',transform:[{rotate:'28deg'}]},
 paperFold:{position:'absolute',left:4,right:4,top:11,bottom:11,borderWidth:1,
  borderColor:'rgba(250,238,204,0.55)',borderRadius:16},
 tabs:{flexDirection:'row',gap:4,paddingBottom:12,borderBottomWidth:1,borderBottomColor:'#b59a77'},
 tab:{flex:1,minWidth:0,minHeight:50,paddingVertical:7,paddingHorizontal:2,
  borderRadius:10,borderWidth:1,borderColor:'#b49b78',backgroundColor:'rgba(250,239,210,0.75)',
  alignItems:'center',justifyContent:'center',gap:2},
 selectedTab:{backgroundColor:'#174434',borderColor:'#13382c'},
 tabText:{fontSize:10,fontWeight:'800',color:'#4a4535',textAlign:'center'},
 selectedTabText:{color:'#f5e5c5'},tabPlus:{fontSize:11,color:'#896845'},
 songList:{paddingHorizontal:3},
 song:{flexDirection:'row',gap:10,alignItems:'center',justifyContent:'space-between',
  paddingVertical:15,borderBottomWidth:1,borderBottomColor:'rgba(107,82,44,0.22)'},
 songText:{flex:1,gap:4},name:{fontSize:14,color:'#233b30',fontWeight:'700'},
 artist:{color:'#806f58',fontSize:12},hint:{fontSize:12,color:'#657065',lineHeight:19,marginTop:6}
});
