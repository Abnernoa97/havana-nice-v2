// Only timer ownership is shared; PWA and native keep their own WebSocket,
// session, app lifecycle gate, and reconnection callback.
import {chatReconnectDelay,CHAT_WS_HANDSHAKE_TIMEOUT_MS} from './chat-connection.ts';

export type ChatTimerHandle=ReturnType<typeof setTimeout>;
export type ChatTimerClock={
 schedule:(callback:()=>void,delay:number)=>ChatTimerHandle;
 cancel:(handle:ChatTimerHandle)=>void;
};
const defaultClock:ChatTimerClock={
 schedule:(callback,delay)=>setTimeout(callback,delay),
 cancel:handle=>clearTimeout(handle),
};

export class ChatConnectionTimers {
 private retryTimer:ChatTimerHandle|null=null;
 private handshakeTimer:ChatTimerHandle|null=null;
 private retryGeneration=0;
 private handshakeGeneration=0;
 private readonly clock:ChatTimerClock;
 constructor(clock:ChatTimerClock=defaultClock){this.clock=clock;}

 get retryPending():boolean{return this.retryTimer!==null;}

 clearRetry():void{
  this.retryGeneration++;
  if(this.retryTimer!==null)this.clock.cancel(this.retryTimer);
  this.retryTimer=null;
 }
 clearHandshake():void{
  this.handshakeGeneration++;
  if(this.handshakeTimer!==null)this.clock.cancel(this.handshakeTimer);
  this.handshakeTimer=null;
 }

 scheduleRetry(attempt:number,reconnect:()=>void):boolean{
  if(this.retryTimer!==null)return false;
  const generation=++this.retryGeneration;
  this.retryTimer=this.clock.schedule(()=>{
   if(generation!==this.retryGeneration)return;
   this.retryTimer=null;
   this.retryGeneration++;
   reconnect();
  },chatReconnectDelay(attempt));
  return true;
 }

 watchHandshake(stillConnecting:()=>boolean,onStalled:()=>void):void{
  this.clearHandshake();
  const generation=this.handshakeGeneration;
  this.handshakeTimer=this.clock.schedule(()=>{
   if(generation!==this.handshakeGeneration)return;
   this.handshakeTimer=null;
   this.handshakeGeneration++;
   if(stillConnecting())onStalled();
  },CHAT_WS_HANDSHAKE_TIMEOUT_MS);
 }

 clearAll():void{
  this.clearRetry();
  this.clearHandshake();
 }
}
