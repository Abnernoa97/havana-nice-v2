import React from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {MEMBER_MODULES,type MemberScreen} from '@havana/shared';
import NativeCalendar from '../features/calendar/NativeCalendar';
import NativeRepertoire from '../features/repertoire/NativeRepertoire';
import NativeMusicians from '../features/musicians/NativeMusicians';
import NativeFamily from '../features/family/NativeFamily';

type Props={
  displayName:string;
  token:string;
  active:Exclude<MemberScreen,'chat'>;
  onNavigate:(screen:MemberScreen)=>void;
};
// HOME is a navigation surface. Authentication and the native Chat remain
// owned by app/NativeApp.tsx: mounting HOME never issues, copies or revokes a token.
function NativeMemberHome({displayName,token,active,onNavigate}:Props){
  const selected=MEMBER_MODULES.find(module=>module.id===active);
  const content=<>
    <View style={styles.top}>
      <Text style={styles.brand}>HAVANA NICE</Text>
      <Text style={styles.subheading}>ESPACIO DEL EQUIPO</Text>
    </View>
    {active==='home'?<>
      <Text style={styles.eyebrow}>TU ESPACIO PRIVADO</Text>
      <Text style={styles.title}>Inicio</Text>
      <Text style={styles.greeting}>Hola, {displayName}.</Text>
      <Text style={styles.lead}>Eventos, repertorio y archivos. Todo aquí.</Text>
      <View style={styles.modules}>
        {MEMBER_MODULES.map(module=><Pressable key={module.id}
          style={styles.tile} accessibilityRole="button"
          accessibilityLabel={'Abrir '+module.label}
          onPress={()=>onNavigate(module.id)}>
          <View style={styles.tileHead}>
            <Text style={styles.symbol} accessibilityElementsHidden>{module.glyph}</Text>
            <Text style={styles.tileTitle}>{module.label}</Text>
          </View>
          <Text style={styles.tileBody}>{module.description}</Text>
          <Text style={styles.tileState}>{module.nativeReady?'Disponible':'En preparación'}</Text>
        </Pressable>)}
      </View>
    </>:<>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver a Inicio"
        style={styles.back} onPress={()=>onNavigate('home')}>
        <Text style={styles.backLabel}>‹ Inicio</Text>
      </Pressable>
      <Text style={styles.title}>{selected?.label||'Módulo'}</Text>
      <Text style={styles.lead}>{selected?.description}</Text>
      {active==='calendar'?<NativeCalendar token={token}/>:
       active==='repertoire'?<NativeRepertoire token={token}/>:
       active==='musicians'?<NativeMusicians token={token}/>:
       active==='family'?<NativeFamily token={token}/>:<View style={styles.pending}>
        <Text style={styles.pendingTitle}>Módulo en preparación</Text>
        <Text style={styles.pendingDescription}>
          Aquí aparecerán datos reales cuando este módulo quede conectado al Administrador.
        </Text>
      </View>}
    </>}
  </>;
  return <View style={styles.screen}>
   {active==='family'
    ?<View style={[styles.root,styles.content,styles.familyViewport]}>{content}</View>
    :<ScrollView style={styles.root} contentContainerStyle={styles.content}>{content}</ScrollView>}
  <View style={styles.bottomNav} accessibilityRole="tablist">
   {(['home','chat','calendar','repertoire','family'] as MemberScreen[]).map(dest=>{
    const match=MEMBER_MODULES.find(m=>m.id===dest);
    const activeTab=active===dest;
    return <Pressable key={dest} accessibilityRole="tab" accessibilityState={{selected:activeTab}}
     accessibilityLabel={dest==='home'?'Inicio':match?.label||dest}
     style={[styles.bottomTab,activeTab&&styles.activeTab]} onPress={()=>onNavigate(dest)}>
     <Text style={[styles.bottomGlyph,activeTab&&styles.activeLabel]}>{dest==='home'?'⌂':match?.glyph||'•'}</Text>
     <Text style={[styles.bottomLabel,activeTab&&styles.activeLabel]}>{dest==='home'?'Inicio':match?.label||dest}</Text>
    </Pressable>;
   })}
  </View>
 </View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#F7F4ED'},
  root:{flex:1},
  bottomNav:{flexDirection:'row',justifyContent:'space-around',backgroundColor:'#FFFCF7',borderTopWidth:1,borderColor:'#E4DDD1',paddingVertical:8},
  bottomTab:{flex:1,alignItems:'center',borderRadius:11,paddingVertical:6,marginHorizontal:2},
  activeTab:{backgroundColor:'#E7EEE6'},
  bottomGlyph:{fontSize:21,color:'#708077'},
  bottomLabel:{fontSize:10,color:'#708077'},
  activeLabel:{fontWeight:'800',color:'#133B30'},
  content:{padding:24,paddingBottom:55},
  familyViewport:{flex:1,minHeight:0,paddingBottom:0},
  top:{backgroundColor:'#0D2A23',paddingTop:20,paddingBottom:20,paddingHorizontal:20,borderRadius:18,marginTop:12,marginBottom:26,borderWidth:1,borderColor:'#345345'},
  brand:{fontFamily:'serif',fontSize:16,fontWeight:'700',letterSpacing:2.2,color:'#DBC59A'},
  subheading:{fontSize:10,letterSpacing:1.5,color:'#D3DED5',marginTop:8},
  eyebrow:{fontSize:10,letterSpacing:1.7,color:'#84683F',fontWeight:'700'},
  title:{fontSize:39,fontWeight:'700',marginTop:7,color:'#1B332B'},
  greeting:{fontSize:19,fontWeight:'700',marginTop:18,color:'#1B332B'},
  lead:{fontSize:14,lineHeight:21,color:'#657269',marginTop:8,marginBottom:23},
  modules:{flexDirection:'column',gap:11},
  tile:{width:'100%',minHeight:102,backgroundColor:'#FFFCF7',borderRadius:18,
    paddingVertical:17,paddingHorizontal:19,borderWidth:1,borderColor:'#E4DDD1',justifyContent:'space-between'},
  tileHead:{gap:10,flexDirection:'row',alignItems:'center'},
  symbol:{fontSize:22,color:'#133B30',backgroundColor:'#E7EEE6',overflow:'hidden',borderRadius:11,
    textAlign:'center',textAlignVertical:'center',width:38,height:38},
  tileTitle:{fontSize:17,fontWeight:'700',color:'#1B332B'},
  tileBody:{fontSize:12,lineHeight:18,color:'#657269',marginTop:10},
  tileState:{fontSize:10,color:'#84683F',fontWeight:'700',letterSpacing:.6,marginTop:12},
  back:{paddingVertical:9,alignSelf:'flex-start',marginBottom:10},
  backLabel:{fontSize:15,fontWeight:'700',color:'#133B30'},
  pending:{borderWidth:1,borderColor:'#E4DDD1',borderRadius:17,backgroundColor:'#FFFCF7',
    marginTop:24,padding:22,minHeight:150,justifyContent:'center'},
  pendingTitle:{fontSize:19,fontWeight:'700',color:'#1B332B'},
  pendingDescription:{fontSize:13,lineHeight:20,color:'#657269',marginTop:9},
});
// The Chat socket can update in the parent without re-rendering HOME modules.
export default React.memo(NativeMemberHome);
