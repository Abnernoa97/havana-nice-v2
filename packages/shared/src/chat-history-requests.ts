// Shared history lifecycle. Each caller retains its session, state and transport.
import type {ChatMessage,ChatSession,ChatSnapshot} from './index';
import {oldestConfirmedChatSeq,type ChatHistoryRequestGate} from './chat-history';

export type OlderChatRequest={
 session:ChatSession;
 messages:readonly ChatMessage[];
 gate:ChatHistoryRequestGate;
 isCurrent:()=>boolean;
 fetchPage:(session:ChatSession,beforeSeq:number)=>Promise<ChatSnapshot>;
 onStart:()=>void;
 onPage:(page:ChatSnapshot)=>void;
 onError:(reason:unknown)=>void;
 onFinish:()=>void;
};
export async function requestOlderChatPage(options:OlderChatRequest):Promise<boolean>{
 const {session,messages,gate,isCurrent,fetchPage,onStart,onPage,onError,onFinish}=options;
 const oldest=oldestConfirmedChatSeq(messages);
 if(oldest===null)return false;
 const request=gate.beginOlder();
 if(request===null)return false;
 const valid=()=>gate.isOlderCurrent(request)&&isCurrent();
 onStart();
 try{
  const page=await fetchPage(session,oldest);
  if(!valid())return false;
  onPage(page);
  return true;
 }catch(reason){
  if(valid())onError(reason);
  return false;
 }finally{
  if(gate.finishOlder(request))onFinish();
 }
}

export type SnapshotChatRequest={
 session:ChatSession;
 gate:ChatHistoryRequestGate;
 isCurrent:()=>boolean;
 fetchSnapshot:(session:ChatSession)=>Promise<ChatSnapshot>;
 onPage:(page:ChatSnapshot)=>void;
 onError:(reason:unknown)=>void;
};
export async function requestChatSnapshot(options:SnapshotChatRequest):Promise<void>{
 const {session,gate,isCurrent,fetchSnapshot,onPage,onError}=options;
 const request=gate.beginSnapshot();
 const valid=()=>gate.isSnapshotCurrent(request)&&isCurrent();
 try{
  const page=await fetchSnapshot(session);
  if(valid())onPage(page);
 }catch(reason){
  if(valid())onError(reason);
 }
}
