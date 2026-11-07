import {HAVANA_V2_DEV_API_BASE_URL as API,type CalendarEvent,type CalendarEventInput,type RepertoireSong,type RepertoireSongInput,type RepertoireEventItem} from '@havana/shared';

// Do not save administrative bearer tokens in localStorage, IndexedDB or cookies.
export type AdminSession={token:string;expiresAt:string;role:'chat-admin'};
type ApiResult={error?:string};
export class AdminApiError extends Error{
 constructor(message:string,readonly status:number){super(message);this.name='AdminApiError';}
}
export function isAdminUnauthorized(reason:unknown):boolean{
 return reason instanceof AdminApiError && reason.status===401;
}
async function api<T>(path:string,options:RequestInit={}):Promise<T>{
 const res=await fetch(API+path,{...options,cache:'no-store',headers:{
   Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers,
 }});
 const result=await res.json() as T&ApiResult;
 if(!res.ok)throw new AdminApiError(result.error||`Operación no disponible: ${res.status}`,res.status);
 return result;
}
function authenticated(token:string,options:RequestInit={}):RequestInit{
 return {...options,headers:{Authorization:`Bearer ${token}`,...options.headers}};
}
export function adminAvailability(){
 return api<{enabled:boolean}>('/api/chat/admin/auth/status');
}
export function adminLogin(password:string){
 return api<AdminSession>('/api/chat/admin/auth/session',{method:'POST',body:JSON.stringify({password})});
}
export function adminLogout(token:string){
 return api<{ok:boolean}>('/api/chat/admin/auth/session',authenticated(token,{method:'DELETE'}));
}
export function adminVerify(token:string){
 return api<{ok:boolean}>('/api/chat/admin/auth/session',authenticated(token));
}
export function adminOtherSessions(token:string){
 return api<{others:number}>('/api/chat/admin/auth/sessions',authenticated(token));
}
export function adminRevokeOtherSessions(token:string){
 return api<{ok:boolean;revoked:number}>('/api/chat/admin/auth/revoke-others',
  authenticated(token,{method:'POST'}));
}
export type AdminMember={
 actor_id:string;username:string;display_name:string;active:number;session_count:number;
 installation_bound?:number;
};
export function adminMembers(token:string){
 return api<{members:AdminMember[]}>('/api/chat/admin/members',authenticated(token));
}
export function adminCreateMember(token:string,displayName:string){
 return api<{member:AdminMember}>('/api/chat/admin/members',authenticated(token,{method:'POST',body:JSON.stringify({displayName})}));
}
export type AdminMemberHistoryEvent={
 event_type:'login'|'connect'|'disconnect';occurred_at:number;
 platform:string;operating_system:string;device_name:string;device_model:string|null;
};
export type AdminMemberHistory={
 entries:number;events:AdminMemberHistoryEvent[];since:string;
};
export function adminMemberHistory(token:string,actorId:string){
 return api<AdminMemberHistory>('/api/chat/admin/member-history?actorId='+encodeURIComponent(actorId),authenticated(token));
}
export type AdminDeletionImpact={
 sessions:number;messages:number;reactions:number;receipts:number;
 historyEvents:number;
};
export type AdminDeletionPreview={displayName:string;counts:AdminDeletionImpact;canDelete:boolean};
export function adminDeletionPreview(token:string,actorId:string){
 return api<AdminDeletionPreview>(
  '/api/chat/admin/member-delete-preview?actorId='+encodeURIComponent(actorId),
  authenticated(token));
}
export function adminRemoveMember(token:string,actorId:string,confirmName:string){
 return api<{ok:boolean;deleted:boolean}>('/api/chat/admin/remove-member',
  authenticated(token,{method:'POST',body:JSON.stringify({actorId,confirmName})}));
}

export type AdminDuplicateLoginAlert={
 id:string;actor_id:string;display_name:string;attempted_at:number;
 platform:string;operating_system:string;device_name:string;reviewed_at:number|null;
};
export function adminDuplicateLogins(token:string){
 return api<{alerts:AdminDuplicateLoginAlert[]}>('/api/chat/admin/duplicate-logins',authenticated(token));
}
export function adminReviewDuplicateLogin(token:string,id:string){
 return api<{ok:boolean}>('/api/chat/admin/duplicate-logins/review',
  authenticated(token,{method:'POST',body:JSON.stringify({id})}));
}
export function adminReleaseInstallation(token:string,actorId:string,confirmName:string){
 return api<{ok:boolean;revokedSessions:number}>('/api/chat/admin/release-installation',
  authenticated(token,{method:'POST',body:JSON.stringify({actorId,confirmName})}));
}
export type AdminChatMessage={
 seq:number;clientMessageId:string;senderId:string;senderName:string;text:string;
 sentAt:string;replyToSeq:number|null;editedAt:string|null;deletedAt:string|null;
 media?:{assetId:string;kind:'photo'|'video';mimeType:string;sizeBytes:number;name:string}|null;
};
export type AdminChatReaction={messageSeq:number;actorId:string;emoji:string};
export type AdminChatSnapshot={messages:AdminChatMessage[];reactions:AdminChatReaction[];hasMore:boolean};
export function adminChatMessages(token:string,beforeSeq?:number){
 const before=beforeSeq===undefined?'':'?beforeSeq='+encodeURIComponent(String(beforeSeq));
 return api<AdminChatSnapshot>('/api/chat/admin/messages'+before,authenticated(token));
}
export function adminDeleteChatMessage(token:string,seq:number){
 return api<{ok:boolean;seq:number}>('/api/chat/admin/messages/'+encodeURIComponent(String(seq)),
  authenticated(token,{method:'DELETE'}));
}
export type AdminChatStreamEvent=
 |{type:'admin.chat.message'|'admin.chat.updated';message:AdminChatMessage}
 |{type:'admin.chat.deleted';seq:number}
 |{type:'admin.chat.reaction';messageSeq:number;actorId:string;emoji:string;active:boolean}
 |{type:'admin.chat.presence';users:{actorId:string;displayName:string}[]}
 |{type:'admin.chat.typing';actorId:string;senderName:string;active:boolean;expiresAt:number}
 |{type:'admin.chat.read';actorId:string;displayName:string;seq:number};
export type AdminRealtimeEvent={type:'admin.ready'}|{type:'admin.invalidate';topic:'members'}|AdminChatStreamEvent;
export function openAdminRealtime(token:string,onEvent:(event:AdminRealtimeEvent)=>void):WebSocket{
 if(!/^[A-Za-z0-9_-]{40,128}$/.test(token))throw new Error('Sesión administrativa inválida');
 const url=API.replace(/^http/,'ws')+'/ws/admin';
 const socket=new WebSocket(url,['havana-v2-admin','admin.'+token]);
 socket.addEventListener('message',event=>{
  try{
   const value=JSON.parse(String(event.data)) as Partial<AdminRealtimeEvent>;
   if(value.type==='admin.ready')onEvent({type:'admin.ready'});
   if(value.type==='admin.invalidate'&&value.topic==='members')
     onEvent({type:'admin.invalidate',topic:value.topic});
   if(value.type==='admin.chat.message'||value.type==='admin.chat.updated'){
     const data=value as Partial<Extract<AdminChatStreamEvent,{type:'admin.chat.message'|'admin.chat.updated'}>>;
     if(data.message&&Number.isSafeInteger(data.message.seq))
       onEvent({type:value.type,message:data.message});
   }
   if(value.type==='admin.chat.deleted'&&Number.isSafeInteger((value as {seq?:number}).seq))
     onEvent(value as AdminChatStreamEvent);
   if(value.type==='admin.chat.presence'&&Array.isArray((value as {users?:unknown}).users))
     onEvent(value as AdminChatStreamEvent);
   if(value.type==='admin.chat.reaction'||value.type==='admin.chat.typing'||value.type==='admin.chat.read')
     onEvent(value as AdminChatStreamEvent);
  }catch{/* Unrecognized server event: ignore; privileged API remains authoritative. */}
 });
 return socket;
}

export function adminCreateCalendarEvent(token:string,body:CalendarEventInput){
 return api<{event:CalendarEvent}>('/api/calendar/admin/events',
  authenticated(token,{method:'POST',body:JSON.stringify(body)}));
}
export function adminUpdateCalendarEvent(token:string,id:string,body:CalendarEventInput&{version:number}){
 return api<{event:CalendarEvent}>('/api/calendar/admin/events/'+encodeURIComponent(id),
  authenticated(token,{method:'POST',body:JSON.stringify(body)}));
}
export function adminDeleteCalendarEvent(token:string,id:string,version:number){
 return api<{ok:boolean}>('/api/calendar/admin/events/'+encodeURIComponent(id),
  authenticated(token,{method:'DELETE',body:JSON.stringify({version})}));
}

export function adminCreateSong(token:string,data:RepertoireSongInput){
 return api<{song:RepertoireSong}>('/api/repertoire/admin/songs',authenticated(token,{method:'POST',body:JSON.stringify(data)}));
}
export function adminEditSong(token:string,id:string,data:RepertoireSongInput&{version:number}){
 return api<{song:RepertoireSong}>('/api/repertoire/admin/songs/'+encodeURIComponent(id),authenticated(token,{method:'POST',body:JSON.stringify(data)}));
}
export function adminDeleteSong(token:string,id:string,version:number){
 return api<{ok:boolean}>('/api/repertoire/admin/songs/'+encodeURIComponent(id),authenticated(token,{method:'DELETE',body:JSON.stringify({version})}));
}
export function adminAddEventSongs(token:string,eventId:string,songIds:string[]){
 return api<{added:number;items:RepertoireEventItem[]}>('/api/repertoire/admin/events/'+encodeURIComponent(eventId)+'/items',
  authenticated(token,{method:'POST',body:JSON.stringify({songIds})}));
}
export function adminAddEventSpecial(token:string,eventId:string,special:{title:string;artist:string;referenceUrl:string}){
 return api<{added:number;items:RepertoireEventItem[]}>('/api/repertoire/admin/events/'+encodeURIComponent(eventId)+'/items',
  authenticated(token,{method:'POST',body:JSON.stringify({special})}));
}
export function adminCompleteEventItem(token:string,id:string,completed:boolean){
 return api<{ok:boolean}>('/api/repertoire/admin/items/'+encodeURIComponent(id),
  authenticated(token,{method:'POST',body:JSON.stringify({completed})}));
}
export function adminRemoveEventItem(token:string,id:string){
 return api<{ok:boolean}>('/api/repertoire/admin/items/'+encodeURIComponent(id),authenticated(token,{method:'DELETE'}));
}
export function adminReorderEventItems(token:string,eventId:string,itemIds:string[]){
 return api<{items:RepertoireEventItem[]}>('/api/repertoire/admin/events/'+encodeURIComponent(eventId)+'/order',
  authenticated(token,{method:'POST',body:JSON.stringify({itemIds})}));
}
