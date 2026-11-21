import {StyleSheet} from 'react-native';

// HOME-only circular strip. Viewer, conversation, audio and reactions own styles.
export const storyStyles=StyleSheet.create({
 row:{marginHorizontal:-9,minHeight:129},
 scroller:{paddingVertical:13,paddingHorizontal:3,gap:11,alignItems:'flex-start'},
 member:{width:80,minWidth:80,alignItems:'center',gap:6},
 slot:{width:76,height:76,alignItems:'center',justifyContent:'center'},
 ring:{width:70,height:70,borderRadius:35,borderWidth:2,borderColor:'#d6d6d6',
  padding:2,alignItems:'center',justifyContent:'center',backgroundColor:'#f4f4f4'},
 activeRing:{borderColor:'#bd9b60'},
 ownRing:{borderColor:'#d4b687'},
 photo:{width:62,height:62,borderRadius:31},
 initial:{fontSize:22,color:'#555',fontWeight:'600'},
 plus:{position:'absolute',right:0,bottom:0,width:25,height:25,borderRadius:13,
  borderWidth:2,borderColor:'#fff',backgroundColor:'#183d32',
  justifyContent:'center',alignItems:'center'},
 plusText:{color:'#fff',fontSize:19,lineHeight:20},
 name:{width:80,height:18,lineHeight:18,fontSize:11,textAlign:'center',color:'#333'},
 error:{fontSize:12,color:'#9d4d40',paddingVertical:6},
});
