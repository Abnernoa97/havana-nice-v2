// Only actual authenticated musician UI actions are recorded; never chat bodies, media or tokens.
const allowed=new Set(['home','chat','calendar','repertoire','musicians','family','notices','audio']);
export async function handleMemberActivity(request,env,url,origin,respond,verifySession){
 if(request.method!=='POST')return respond({error:'Método no permitido'},405,origin);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const actor=await verifySession(env,token);
 if(!actor)return respond({error:'No autorizado'},401,origin);
 let body;
 try{body=await request.json();}catch{return respond({error:'Solicitud inválida'},400,origin);}
 const action=body?.type;
 const target=typeof body?.target==='string'?body.target:'';
 if(!['module.open','audio.play'].includes(action)||target.length>100)
  return respond({error:'Actividad inválida'},400,origin);
 let detail='';
 if(action==='module.open'){
  if(!allowed.has(target))return respond({error:'Sección inválida'},400,origin);
  detail=target;
 }else{
  if(!/^[0-9a-f-]{36}$/i.test(target))return respond({error:'Audio inválido'},400,origin);
  const track=await env.DB.prepare('SELECT title FROM audio_tracks WHERE id=? AND published=1')
   .bind(target).first();
  if(!track)return respond({error:'Audio no disponible'},404,origin);
  detail=String(track.title).slice(0,100);
 }
 const platform=request.headers.get('x-havana-platform')==='android'?'Android nativo':'iPhone PWA';
 try{
  const now=Date.now();
  // Avoid duplicate events when the view remounts or resumes in the same seconds.
  const recent=await env.DB.prepare('SELECT occurred_at FROM member_activity_events WHERE actor_id=? '+
   'AND event_type=? AND target_id=? ORDER BY occurred_at DESC LIMIT 1')
   .bind(actor.actorId,action,target).first();
  if(recent&&now-Number(recent.occurred_at)<5000)
   return respond({ok:true,duplicate:true},200,origin);
  await env.DB.prepare('INSERT INTO member_activity_events '+
   '(id,actor_id,event_type,target_id,detail,occurred_at,platform) VALUES(?,?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),actor.actorId,action,target,detail,now,platform).run();
  return respond({ok:true},201,origin);
 }catch{return respond({error:'Registro de actividad no disponible'},503,origin);}
}
