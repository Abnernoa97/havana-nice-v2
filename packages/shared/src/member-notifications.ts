import {HAVANA_V2_DEV_API_BASE_URL as API} from './api-base';

export type MemberNoticeKind=
 'story.created'|'story.reaction'|'story.comment'|'story.voice'|
 'chat.reaction'|'chat.message'|'calendar.event'|'family.media'|'repertoire.updated'|'profile.photo'|'book.updated'|'admin.announcement';
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
export function memberNoticeMessage(item:Pick<MemberNotice,'name'|'kind'|'emoji'>&Partial<Pick<MemberNotice,'preview'>>):string{
 switch(item.kind){
  case 'story.created':return item.name+(item.preview?.match(/^(\d+) nuevos Estados publicados$/)?' publicó '+item.preview.split(' ')[0]+' Estados':' publicó un nuevo Estado');
  case 'story.reaction':return item.name+' reaccionó '+(item.emoji||'❤️')+' a tu estado';
  case 'story.comment':return item.name+' comentó tu estado';
  case 'story.voice':return item.name+' te envió una nota de voz en tu estado';
  case 'chat.reaction':return item.name+' reaccionó '+(item.emoji||'❤️')+' a tu mensaje';
  case 'chat.message':return item.name+(item.preview==='Nueva foto en Chat'?' envió una foto al Chat':item.preview==='Nuevo video en Chat'?' envió un video al Chat':' envió un mensaje al equipo');
  case 'calendar.event':return 'HAVANANICE-CALENDARIO📆';
  case 'family.media':return 'Administración agregó '+(item.preview==='Nuevo video en Familia'?'un video':'una foto')+' al álbum de '+item.name;
  case 'profile.photo':return item.name+' actualizó su foto de perfil';
  case 'repertoire.updated':return item.preview?.includes('repertorio general')?'Administración actualizó el repertorio general':'Administración actualizó tu repertorio del evento';
  case 'book.updated':return 'Administración actualizó el BOOK 3D';
  case 'admin.announcement':return 'Mensaje de Administración';
  default:return 'Nueva actividad del equipo';
 }
}
