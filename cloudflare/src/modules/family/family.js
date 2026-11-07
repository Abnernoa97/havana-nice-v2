// HAVANA NICE V2 — Familia; one existing member/Admin authorization boundary.
// R2 content is exclusively served through short-lived opaque media grants.
import {verifyAdminSession} from '../admin/admin-auth.js';
import {notifyFamilyClients} from './family-realtime.js';
import {familyStorageUsage} from './family-quota.js';
import {familyMultipartRoute,handleFamilyMultipart} from './family-multipart.js';
import {familyAlbumRoute,familyAlbumSummaries,familyMediaItemRoute,listFamilyMedia,readFamilyGrant,uploadFamilyMedia,checkFamilyOriginalUpload,uploadFamilyPoster,deleteFamilyMedia,selectFamilyCover} from './family-media.js';

export async function handleFamilyApi(request,env,url,origin,respond,verifyMusicianSession,ctx){
 const reply=(value,status=200)=>respond(value,status,origin);
 const signalSaved=(result)=>{
  if(result.ok){
   const task=notifyFamilyClients(env);
   if(ctx?.waitUntil)ctx.waitUntil(task);
   else void task;
  }
  return result;
 };
 if(url.pathname.startsWith('/api/family/media/')){
  try{return await readFamilyGrant(request,env,url,origin);}
  catch{return reply({error:'Archivo privado no disponible'},503);}
 }
 const isAdmin=url.pathname.startsWith('/api/family/admin/');
 if(isAdmin){
  if(!await verifyAdminSession(request,env))return reply({error:'No autorizado'},401);
 }else{
  const token=(request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!await verifyMusicianSession(env,token))
   return reply({error:'No autorizado'},401);
 }
 const transfer=familyMultipartRoute(url.pathname);
 if(transfer){
  if(!isAdmin)return reply({error:'No autorizado'},401);
  const result=await handleFamilyMultipart(request,env,transfer);
  // Preserve the existing trusted browser CORS policy for cross-origin Admin uploads.
  result.headers.set('access-control-allow-origin',origin||'https://havana-nice-v2-dev.pages.dev');
  result.headers.set('vary','Origin');
  return request.method==='POST'&&transfer.complete?signalSaved(result):result;
 }
 const item=familyMediaItemRoute(url.pathname);
 if(item){
  if(!isAdmin)return reply({error:'No autorizado'},401);
  if(!env.MEDIA_BUCKET)return reply({error:'Almacenamiento no disponible'},503);
  if(request.method==='GET'&&!item.cover&&!item.poster)
   return checkFamilyOriginalUpload(env,item.actorId,item.id,origin);
  if(request.method==='DELETE'&&!item.cover&&!item.poster)
   return signalSaved(await deleteFamilyMedia(env,item.actorId,item.id,origin));
  if(request.method==='POST'&&item.cover)
   return signalSaved(await selectFamilyCover(env,item.actorId,item.id,origin));
  if(request.method==='POST'&&item.poster)
   return signalSaved(await uploadFamilyPoster(request,env,item.actorId,item.id,origin));
  return reply({error:'Método no permitido'},405);
 }
 const route=familyAlbumRoute(url.pathname);
 if(route){
  if(!env.MEDIA_BUCKET)return reply({error:'Almacenamiento no disponible'},503);
  if(request.method==='GET'){
   try{
    const items=await listFamilyMedia(env,route.actorId);
    return items?reply({actorId:route.actorId,items}):reply({error:'Álbum no encontrado'},404);
   }catch{return reply({error:'Archivos no disponibles'},503);}
  }
  if(request.method==='POST'&&isAdmin&&route.admin)
   return signalSaved(await uploadFamilyMedia(request,env,route.actorId,origin));
  return reply({error:'Método no permitido'},405);
 }
 if(request.method!=='GET')return reply({error:'Método no permitido'},405);
 if(url.pathname!==(isAdmin?'/api/family/admin/albums':'/api/family/albums'))
  return reply({error:'Ruta no encontrada'},404);
 try{
  // Identity is governed exclusively by the existing Admin-authorized roster.
  const rows=await env.DB.prepare(
   'SELECT actor_id,display_name FROM chat_members WHERE active=1 ORDER BY display_name COLLATE NOCASE,actor_id LIMIT 30'
  ).all();
  const albums=env.MEDIA_BUCKET?await familyAlbumSummaries(env,rows.results||[]):
   (rows.results||[]).map(row=>({
    actorId:row.actor_id,name:row.display_name,
    photoCount:0,videoCount:0,coverUrl:null,mediaReady:false,
   }));
  return reply({
   section:'Familia HAVANA NICE',albums,
   mediaReady:!!env.MEDIA_BUCKET,
   ...(isAdmin&&env.MEDIA_BUCKET?{storage:await familyStorageUsage(env)}:{}),
  });
 }catch{
  return reply({error:'Familia HAVANA NICE no está disponible'},503);
 }
}
