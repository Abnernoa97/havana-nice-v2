// Navigation is UI-only. Session and socket ownership stay in Chat controller.
import {useCallback,useEffect,useRef,type Dispatch,type SetStateAction} from 'react';
import {BackHandler,Keyboard,PanResponder,Platform} from 'react-native';
import type {ChatSession,MemberScreen,ChatMessage} from '@havana/shared';
type Panel='attachments'|'emojis'|null;
export function useNativeMemberNavigation({
 session,activeScreen,setActiveScreen,composerPanel,setComposerPanel,menuMessage,setMenuMessage,
}:{
 session:ChatSession|null;activeScreen:MemberScreen;
 setActiveScreen:Dispatch<SetStateAction<MemberScreen>>;
 composerPanel:Panel;setComposerPanel:Dispatch<SetStateAction<Panel>>;
 menuMessage:ChatMessage|null;setMenuMessage:Dispatch<SetStateAction<ChatMessage|null>>;
}){
  const previousScreen=useRef<MemberScreen>('home');
  const activeScreenRef=useRef({screen:activeScreen,authorized:!!session});
  activeScreenRef.current={screen:activeScreen,authorized:!!session};
  const navigateTo=useCallback((target:MemberScreen)=>{
    if(target!=='chat'){setComposerPanel(null);setMenuMessage(null);}
    if(target==='chat'&&activeScreen!=='chat')previousScreen.current=activeScreen;
    setActiveScreen(target);
  },[activeScreen]);
  // Only the extreme left edge: do not capture message-reply swipes.
  const iosBackPan=useRef(PanResponder.create({
    onStartShouldSetPanResponder:()=>false,
    onMoveShouldSetPanResponderCapture:(_,gesture)=>
      Platform.OS==='ios'&&activeScreenRef.current.authorized&&
      activeScreenRef.current.screen==='chat'&&gesture.x0<28&&
      gesture.dx>24&&Math.abs(gesture.dy)<40,
    onPanResponderRelease:(_,gesture)=>{
      if(gesture.dx>72&&Math.abs(gesture.dy)<65){
        Keyboard.dismiss();setMenuMessage(null);setActiveScreen(previousScreen.current);
      }
    },
  })).current;
  // Android system Back only navigates; it never resets sessions or media.
  useEffect(()=>{
    if(Platform.OS!=='android')return;
    const listener=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(menuMessage){setMenuMessage(null);return true;}
      if(composerPanel){setComposerPanel(null);return true;}
      if(session&&activeScreen==='chat'){
        Keyboard.dismiss();setActiveScreen(previousScreen.current);return true;
      }
      if(session&&activeScreen!=='home'){setActiveScreen('home');return true;}
      return false;
    });
    return()=>listener.remove();
  },[session,activeScreen,menuMessage,composerPanel]);
  return {navigateTo,iosBackPan};
}
