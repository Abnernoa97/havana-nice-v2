// Private Administrator memory summary, read-only and derived from the canonical D1
// media records. Never enumerate private R2 object keys or create access grants.
// The managed quota comes from the existing cross-module familyStorageUsage helper.
import {verifyAdminSession} from './admin-auth.js';
import {familyStorageUsage} from '../family/family-quota.js';

const GROUPS=[
 {id:'family',name:'Familia',sql:`SELECT COUNT(*) count,COALESCE(SUM(size_bytes+
  CASE WHEN poster_key IS NULL THEN 0 WHEN poster_size_bytes>0
   THEN poster_size_bytes ELSE 393216 END),0) bytes FROM family_media`},
 {id:'chat',name:'Chat',sql:`SELECT COUNT(*) count,COALESCE(SUM(size_bytes),0) bytes
  FROM chat_media_objects WHERE status='ready'`},
 {id:'book',name:'BOOK',sql:`SELECT COUNT(*) count,
  COALESCE(SUM(size_bytes+optimized_size_bytes),0) bytes FROM book_pages`},
 {id:'calendar',name:'Calendario',sql:`SELECT COUNT(*) count,
  COALESCE(SUM(size_bytes+optimized_size_bytes),0) bytes FROM calendar_event_photos`},
 {id:'stories',name:'Estados',sql:`SELECT COUNT(*) count,
  COALESCE(SUM(byte_size),0) bytes FROM member_stories`},
 {id:'profiles',name:'Perfiles',sql:`SELECT COUNT(*) count,
  COALESCE(SUM(photo_size),0) bytes FROM member_profiles WHERE photo_key IS NOT NULL`},
 {id:'cleanup',name:'Pendiente de limpieza',sql:`SELECT
  ((SELECT COUNT(*) FROM r2_member_delete_queue)+
   (SELECT COUNT(*) FROM book_delete_queue)+
   (SELECT COUNT(*) FROM calendar_photo_delete_queue)) count,
  ((SELECT COALESCE(SUM(size_bytes),0) FROM r2_member_delete_queue)+
   (SELECT COALESCE(SUM(size_bytes),0) FROM book_delete_queue)+
   (SELECT COALESCE(SUM(size_bytes),0) FROM calendar_photo_delete_queue)) bytes`},
];
export async function handleAdminStorageSummary(request,env,url,origin,respond){
 const reply=(body,status=200)=>respond(body,status,origin);
 if(url.pathname!=='/api/chat/admin/storage/summary'||request.method!=='GET')
  return reply({error:'Ruta no encontrada'},404);
 if(!await verifyAdminSession(request,env))return reply({error:'No autorizado'},401);
 try{
  const [quota,...records]=await Promise.all([
   familyStorageUsage(env),
   ...GROUPS.map(async group=>{
    const row=await env.DB.prepare(group.sql).first();
    return {id:group.id,name:group.name,count:Number(row?.count||0),bytes:Number(row?.bytes||0)};
   })
  ]);
  const files=records.filter(item=>item.id!=='cleanup');
  const extraBytes=files.filter(item=>item.id==='stories'||item.id==='profiles')
   .reduce((sum,item)=>sum+item.bytes,0);
  return reply({
   storage:quota,
   rows:records,
   indexedFiles:files.reduce((sum,item)=>sum+item.count,0),
   indexedBytes:records.reduce((sum,item)=>sum+item.bytes,0),
   outsideQuotaBytes:extraBytes,
   note:'Cifras basadas en archivos registrados en D1. No son un inventario directo de R2. Estados y perfiles se muestran por separado del límite controlado.'
  });
 }catch{return reply({error:'No se pudo consultar el almacenamiento.'},503);}
}
