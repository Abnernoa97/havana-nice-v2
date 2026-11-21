import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';

export type MemberNoticeKind=
 'story.reaction'|'story.comment'|'story.voice'|
 'chat.reaction'|'chat.message'|'calendar.event'|'family.media'|'repertoire.updated';
export interface MemberNotice {
 id:string;actorId:string;name:string;kind:MemberNoticeKind;
 targetId:string;emoji:string;preview:string;createdAt:number;readAt:number|null;
}
export interface MemberNoticeInbox {items:MemberNotice[];unread:number}
export class MemberNoticeApiError extends Error {
 constructor(message:string,readonly status:number){super(message);this.name='MemberNoticeApiError';}
}
export async function getMemberNotices(token:string,base=API,signal?:AbortSignal):Promise<MemberNoticeInbox>{
 const result=await fetch(base+'/api/notices',{
  cache:'no-store',headers:{Authorization:'Bearer '+token},
  ...(signal?{signal}:{})
 });
 const body=await result.json().catch(()=>({error:'Notificaciones no disponibles.'})) as
  Partial<MemberNoticeInbox>&{error?:string};
 if(!result.ok)throw new MemberNoticeApiError(body.error||'No se pudieron leer las notificaciones.',result.status);
 return {items:body.items||[],unread:body.unread||0};
}
export async function markMemberNoticesRead(token:string,id?:string,base=API):Promise<void>{
 const result=await fetch(base+'/api/notices/read',{
  method:'POST',cache:'no-store',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify({id:id||null})
 });
 const body=await result.json().catch(()=>({error:'No se pudo marcar como leído.'})) as {error?:string};
 if(!result.ok)throw new MemberNoticeApiError(body.error||'No se pudo marcar como leído.',result.status);
}
export function memberNoticeMessage(item:Pick<MemberNotice,'name'|'kind'|'emoji'>):string{
 switch(item.kind){
  case 'story.reaction':return item.name+' reaccionó '+(item.emoji||'❤️')+' a tu estado';
  case 'story.comment':return item.name+' comentó tu estado';
  case 'story.voice':return item.name+' te envió una nota de voz en tu estado';
  case 'chat.reaction':return item.name+' reaccionó a tu mensaje';
  case 'chat.message':return item.name+' envió un mensaje al equipo';
  case 'calendar.event':return 'Se actualizó tu calendario';
  case 'family.media':return item.name+' compartió nuevos recuerdos';
  case 'repertoire.updated':return 'Se actualizó tu repertorio';
  default:return 'Nueva actividad del equipo';
 }
}
