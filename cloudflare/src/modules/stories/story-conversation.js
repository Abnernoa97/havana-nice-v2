// Public within the authorized HAVANA NICE team, NOT part of Chat or its socket.
// One conversation per 24h photo, with short-lived R2 voice grants and two reactions.
import {sha256Hex} from '../../shared/crypto-helpers.js';
import {notifyFamilyClients} from '../family/family-realtime.js';

const STORY_PATH=/^\/api\/stories\/([a-f0-9-]{36})\/(conversation|text|voice|reaction)$/i;
const VOICE_PATH=/^\/api\/stories\/voice\/([a-f0-9]{32})$/;
const MIME=new Set(['audio/mp4','audio/webm','audio/ogg']);
const MAX_VOICE_BYTES=3_000_000;
const VOICE_GRANT_MS=10*60*1000;
const json=(data,status,origin)=>new Response(JSON.stringify(data),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
 'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev','vary':'Origin'}
});
const fail=(error,status,origin)=>json({error},status,origin);
async function visibleStory(env,id){
 return env.DB.prepare('SELECT s.id,s.expires_at FROM member_stories s '+
 'JOIN chat_members m ON m.actor_id=s.actor_id AND m.active=1 '+
 'WHERE s.id=? AND s.expires_at>?').bind(id,Date.now()).first();
}
async function newVoiceGrant(env,id,storyExpiry,origin){
 const random=crypto.randomUUID().replace(/-/g,'');
 await env.DB.prepare(
  'INSERT INTO member_story_voice_grants(token_hash,comment_id,expires_at) VALUES(?,?,?)'
 ).bind(await sha256Hex(random),id,Math.min(Date.now()+VOICE_GRANT_MS,storyExpiry)).run();
 return '/api/stories/voice/'+random;
}
async function conversation(env,id,url,origin){
 const rows=(await env.DB.prepare(
  'SELECT c.id,c.actor_id,m.display_name,c.kind,c.body,c.voice_key,c.created_at '+
  'FROM member_story_comments c JOIN chat_members m ON c.actor_id=m.actor_id AND m.active=1 '+
  'WHERE c.story_id=? ORDER BY c.created_at ASC,c.id ASC LIMIT 150'
 ).bind(id).all()).results||[];
 const story=await visibleStory(env,id);
 if(!story)return fail('El estado ya caducó.',404,origin);
 const comments=await Promise.all(rows.map(async row=>({
  id:row.id,actorId:row.actor_id,name:row.display_name,kind:row.kind,
  text:row.kind==='text'?row.body:'',createdAt:row.created_at,
  voiceUrl:row.kind==='voice'?new URL(await newVoiceGrant(env,row.id,story.expires_at,origin),url.origin).toString():null
 })));
 const reactionRows=(await env.DB.prepare(
  'SELECT emoji,SUM(count) AS total FROM member_story_reactions WHERE story_id=? GROUP BY emoji'
 ).bind(id).all()).results||[];
 const reactions=Object.fromEntries(['❤️','👏'].map(emoji=>[
  emoji,Number(reactionRows.find(row=>row.emoji===emoji)?.total||0)
 ]));
 return json({storyId:id,comments,reactions,serverNow:Date.now()},200,origin);
}
async function postText(request,env,actor,id,origin,ctx){
 let data;
 try{data=await request.json();}catch{return fail('Mensaje inválido.',400,origin);}
 const text=typeof data?.text==='string'?data.text.trim():'';
 if(!text||text.length>500)return fail('Escribe entre 1 y 500 caracteres.',400,origin);
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM member_story_comments WHERE story_id=?').bind(id).first();
 if(Number(count?.n||0)>=150)return fail('Esta conversación alcanzó su límite.',409,origin);
 const commentId=crypto.randomUUID();
 await env.DB.prepare('INSERT INTO member_story_comments '+
  '(id,story_id,actor_id,kind,body,created_at) VALUES(?,?,?,\'text\',?,?)'
 ).bind(commentId,id,actor.actorId,text,Date.now()).run();
 if(ctx?.waitUntil)ctx.waitUntil(notifyFamilyClients(env));
 return json({ok:true,id:commentId},201,origin);
}
async function postVoice(request,env,actor,id,origin,ctx){
 const type=(request.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!MIME.has(type))return fail('Formato de audio no compatible.',415,origin);
 const declared=Number(request.headers.get('content-length'));
 if(request.headers.has('content-length')&&(!Number.isSafeInteger(declared)||declared<1||declared>MAX_VOICE_BYTES))
  return fail('El mensaje de voz supera 3 MB.',413,origin);
 const bytes=await request.arrayBuffer();
 if(bytes.byteLength<1||bytes.byteLength>MAX_VOICE_BYTES)
  return fail('El mensaje de voz supera 3 MB.',413,origin);
 const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM member_story_comments WHERE story_id=?').bind(id).first();
 if(Number(count?.n||0)>=150)return fail('Esta conversación alcanzó su límite.',409,origin);
 const commentId=crypto.randomUUID();
 const key='stories/voice/'+encodeURIComponent(actor.actorId)+'/'+commentId;
 await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:type}});
 try{
  await env.DB.prepare(
   'INSERT INTO member_story_comments (id,story_id,actor_id,kind,body,voice_key,voice_mime,voice_size,created_at) '+
   "VALUES(?,?,?,'voice','',?,?,?,?)"
  ).bind(commentId,id,actor.actorId,key,type,bytes.byteLength,Date.now()).run();
 }catch{
  try{
   await env.DB.prepare('INSERT OR IGNORE INTO r2_member_delete_queue '+
    '(object_key,actor_id,multipart_upload_id,size_bytes,queued_at) VALUES(?,?,NULL,?,?)'
   ).bind(key,actor.actorId,bytes.byteLength,Date.now()).run();
  }catch{}
  try{await env.MEDIA_BUCKET.delete(key);await env.DB.prepare(
   'DELETE FROM r2_member_delete_queue WHERE object_key=?').bind(key).run();}catch{}
  return fail('No se pudo guardar el audio.',503,origin);
 }
 if(ctx?.waitUntil)ctx.waitUntil(notifyFamilyClients(env));
 return json({ok:true,id:commentId},201,origin);
}
async function postReaction(request,env,actor,id,origin,ctx){
 let body;
 try{body=await request.json();}catch{return fail('Reacción inválida.',400,origin);}
 if(body?.emoji!=='❤️'&&body?.emoji!=='👏')return fail('Reacción inválida.',400,origin);
 await env.DB.prepare(
  'INSERT INTO member_story_reactions(story_id,actor_id,emoji,count,updated_at) VALUES(?,?,?,1,?) '+
  'ON CONFLICT(story_id,actor_id,emoji) DO UPDATE SET count=MIN(200,count+1),updated_at=excluded.updated_at'
 ).bind(id,actor.actorId,body.emoji,Date.now()).run();
 if(ctx?.waitUntil)ctx.waitUntil(notifyFamilyClients(env));
 return json({ok:true},200,origin);
}
// Links are short-lived and valid only while the story and author remain active.
async function readVoice(request,env,url,origin){
 if(!['GET','HEAD'].includes(request.method))return fail('Método no permitido.',405,origin);
 const code=VOICE_PATH.exec(url.pathname)?.[1];
 if(!code)return fail('Audio no encontrado.',404,origin);
 const row=await env.DB.prepare(
  'SELECT c.voice_key,c.voice_mime,c.voice_size FROM member_story_voice_grants g '+
  'JOIN member_story_comments c ON c.id=g.comment_id AND c.kind=\'voice\' '+
  'JOIN member_stories s ON s.id=c.story_id AND s.expires_at>? '+
  'JOIN chat_members owner ON owner.actor_id=s.actor_id AND owner.active=1 '+
  'JOIN chat_members sender ON sender.actor_id=c.actor_id AND sender.active=1 '+
  'WHERE g.token_hash=? AND g.expires_at>?'
 ).bind(Date.now(),await sha256Hex(code),Date.now()).first();
 if(!row)return fail('Audio no disponible.',404,origin);
 const range=(request.headers.get('range')||'').match(/^bytes=(\d+)-(\d*)$/);
 let start=0,end=Number(row.voice_size)-1,partial=false;
 if(request.headers.has('range')){
  if(!range)return new Response(null,{status:416,headers:{'content-range':'bytes */'+row.voice_size}});
  start=Number(range[1]);
  end=range[2]?Number(range[2]):end;
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=row.voice_size)
   return new Response(null,{status:416,headers:{'content-range':'bytes */'+row.voice_size}});
  end=Math.min(end,Number(row.voice_size)-1);partial=true;
 }
 const audio=await env.MEDIA_BUCKET.get(row.voice_key,partial?
  {range:{offset:start,length:end-start+1}}:undefined);
 if(!audio)return fail('Audio no encontrado.',404,origin);
 const headers={
  'content-type':row.voice_mime,'cache-control':'private,no-store',
  'x-content-type-options':'nosniff','content-disposition':'inline',
  'access-control-allow-origin':origin||'https://havana-nice-v2.pages.dev','vary':'Origin',
  'accept-ranges':'bytes','content-length':String(partial?end-start+1:row.voice_size),
  ...(partial?{'content-range':`bytes ${start}-${end}/${row.voice_size}`}:{})
 };
 return new Response(request.method==='HEAD'?null:audio.body,{status:partial?206:200,headers});
}
export async function handleStoryConversation(request,env,url,origin,verifySession,ctx){
 try{
  if(VOICE_PATH.test(url.pathname))return readVoice(request,env,url,origin);
  const match=STORY_PATH.exec(url.pathname);
  if(!match)return fail('Ruta no encontrada.',404,origin);
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  const actor=await verifySession(env,token);
  if(!actor)return fail('No autorizado.',401,origin);
  const [,id,action]=match;
  if(!await visibleStory(env,id))return fail('Estado no disponible.',404,origin);
  if(action==='conversation'&&request.method==='GET')return conversation(env,id,url,origin);
  if(action==='text'&&request.method==='POST')return postText(request,env,actor,id,origin,ctx);
  if(action==='voice'&&request.method==='POST')return postVoice(request,env,actor,id,origin,ctx);
  if(action==='reaction'&&request.method==='POST')return postReaction(request,env,actor,id,origin,ctx);
  return fail('Método no permitido.',405,origin);
 }catch{return fail('Conversación temporalmente no disponible.',503,origin);}
}
