import React from 'react';
import {Platform,Pressable,StatusBar,StyleSheet,Text} from 'react-native';
export default function NativeCalendarToast({visible,onDismiss}:{visible:boolean;onDismiss:()=>void}){
 if(!visible)return null;
 return <Pressable accessibilityRole="button"
  accessibilityLabel="HAVANANICE-CALENDARIO📆" onPress={onDismiss}
  style={s.toast}><Text style={s.message}>HAVANANICE-CALENDARIO📆</Text></Pressable>;
}
const s=StyleSheet.create({
 toast:{position:'absolute',top:Platform.OS==='android'?(StatusBar.currentHeight||24)+10:12,
  left:16,right:16,zIndex:3000,alignSelf:'center',
  padding:15,borderRadius:15,backgroundColor:'#123c2e',
  borderWidth:1,borderColor:'#c8b58f',alignItems:'center'},
 message:{fontSize:13,fontWeight:'700',color:'#fffaf0',letterSpacing:0.4}
});
