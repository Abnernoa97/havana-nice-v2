// One consistent, privacy-safe lock-screen copy for every member activity.
// Names come from the authorized roster, not a caller-supplied push payload.
// Never put private Chat text, voice transcripts, R2 paths or tokens on screen.
const label=(value,fallback,max=44)=>String(value||fallback)
 .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()
 .slice(0,max)||fallback;

export function memberPushCopy({kind,actorName,emoji='',preview=''}){
 const who=label(actorName,'Un compañero');
 const icon=label(emoji,'❤️',8);
 const section=kind.startsWith('chat.')?'Chat':
  kind.startsWith('story.')?'Estados':
  kind==='profile.photo'?'Perfil':
  kind==='family.media'?'Familia':'Equipo';
 let body;
 switch(kind){
  case 'chat.message':
   body=preview==='Nuevo video en Chat'?who+' envió un video al Chat':
    preview==='Nueva foto en Chat'?who+' envió una foto al Chat':
    who+' envió un mensaje al Chat';break;
  case 'chat.reaction':body=who+' reaccionó '+icon+' a tu mensaje';break;
  case 'story.created':{
   const total=/^(\d+) nuevos Estados publicados$/.exec(preview);
   body=total?who+' publicó '+total[1]+' Estados':who+' publicó un Estado';break;
  }
  case 'story.comment':body=who+' comentó tu Estado';break;
  case 'story.voice':body=who+' envió un mensaje de voz a tu Estado';break;
  case 'story.reaction':body=who+' reaccionó '+icon+' a tu Estado';break;
  case 'profile.photo':body=who+' actualizó su foto de perfil';break;
  case 'family.media':body='Administración agregó '+
   (preview==='Nuevo video en Familia'?'un video':'una foto')+
   ' al álbum de '+who;break;
  default:body='Nueva actividad del equipo';
 }
 return {title:'HAVANA NICE · '+section,body:body.slice(0,160)};
}
