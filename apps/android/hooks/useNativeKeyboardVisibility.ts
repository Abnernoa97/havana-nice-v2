import {useEffect,useState} from 'react';
import {Keyboard} from 'react-native';

// One listener pair for the entire native Chat screen. No polling,
// no duplicated app lifecycle owner, and no changes to Android IME spacing.
export function useNativeKeyboardVisibility(enabled=true):boolean{
 const [visible,setVisible]=useState(false);
 useEffect(()=>{
  if(!enabled){setVisible(false);return;}
  const show=Keyboard.addListener('keyboardDidShow',()=>setVisible(true));
  const hide=Keyboard.addListener('keyboardDidHide',()=>setVisible(false));
  return ()=>{show.remove();hide.remove();};
 },[enabled]);
 return visible;
}
