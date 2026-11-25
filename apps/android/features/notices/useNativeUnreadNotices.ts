import {useEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {AppState} from 'react-native';
import {getMemberNotices,markMemberNoticesRead,MemberNoticeApiError,
 HAVANA_V2_DEV_API_BASE_URL as API,type MemberNoticeInbox} from '@havana/shared';
import {createNativeNoticeInbox} from './native-notice-inbox';

const EMPTY:MemberNoticeInbox={items:[],unread:0};
// Foreground inbox + badge only. FCM registration and locked-screen delivery
// remain exclusively owned by useNativePush in the authenticated Chat shell.
export function useNativeUnreadNotices(token:string,revision:number,visible:boolean){
 const store=useMemo(()=>createNativeNoticeInbox(
  signal=>getMemberNotices(token,API,signal),
  id=>markMemberNoticesRead(token,id),
  error=>error instanceof MemberNoticeApiError&&(error.status===401||error.status===403)
 ),[token]);
 const snapshot=useSyncExternalStore(store.subscribe,store.getSnapshot);
 const previous=useRef({store,revision});
 useEffect(()=>{
  const update=(state:string|null|undefined)=>{
   store.setActive(state==='active');
   if(state==='active')void store.refresh(true);
  };
  update(AppState.currentState);
  const listener=AppState.addEventListener('change',update);
  const fallback=setInterval(()=>{
   if(AppState.currentState==='active')void store.refresh(true);
  },30_000);
  return()=>{store.setActive(false);listener.remove();clearInterval(fallback);};
 },[store]);
 useEffect(()=>{
  const old=previous.current;previous.current={store,revision};
  if(old.store===store&&old.revision!==revision)void store.refresh(true);
 },[store,revision]);
 useEffect(()=>{if(visible)void store.refresh();},[store,visible]);
 const inbox=snapshot.inbox??EMPTY;
 return {inbox,unread:Math.max(0,Math.min(99,inbox.unread)),
  loading:snapshot.loading,error:snapshot.error,marking:snapshot.marking,
  refresh:store.refresh,mark:store.mark};
}
export type NativeNoticeActivity=ReturnType<typeof useNativeUnreadNotices>;
