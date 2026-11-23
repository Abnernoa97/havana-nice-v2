// A tiny in-memory bridge between the single native Expo Audio playlist and its
// two read-only visual surfaces: the HOME lounge and the full-screen audio view.
// Never store tokens, songs or media credentials outside the existing session.
import {useSyncExternalStore} from 'react';
import type {AudioTrack} from '@havana/shared';

export type NativeAudioSnapshot={
 tracks:AudioTrack[];index:number;playing:boolean;loading:boolean;
 elapsed:number;duration:number;error:string;
};
type NativeAudioCommand='play'|'next'|'previous'|'refresh'|'suspendForChat';
type Handlers={
 play:()=>void;next:()=>void;previous:()=>void;refresh:()=>void;suspendForChat:()=>void;
 select:(index:number)=>void;seek:(time:number)=>void;
};
const initial:NativeAudioSnapshot={
 tracks:[],index:0,playing:false,loading:true,elapsed:0,duration:0,error:''
};
let current=initial;
let handlers:Handlers|null=null;
const subscribers=new Set<()=>void>();
function subscribe(listener:()=>void){
 subscribers.add(listener);
 return ()=>{subscribers.delete(listener);};
}
function getSnapshot(){return current;}
export function useNativeAudioSnapshot(){
 return useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
}
export function clearNativeAudio(){
 handlers=null;
 current=initial;
 subscribers.forEach(callback=>callback());
}
export function publishNativeAudio(next:NativeAudioSnapshot){
 current=next;
 subscribers.forEach(callback=>callback());
}
export function registerNativeAudioHandlers(next:Handlers|null){
 handlers=next;
}
export function sendNativeAudioCommand(action:NativeAudioCommand){
 handlers?.[action]();
}
export function selectNativeAudioTrack(index:number){
 if(Number.isSafeInteger(index)&&index>=0&&index<current.tracks.length)
  handlers?.select(index);
}
export function seekNativeAudio(time:number){
 if(Number.isFinite(time)&&time>=0&&time<=current.duration)
  handlers?.seek(time);
}
